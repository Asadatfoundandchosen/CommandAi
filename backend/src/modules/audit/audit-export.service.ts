import { inject, injectable } from "inversify";
import { Types } from "mongoose";

import { auditExportQueue } from "../../infrastructure/queue/queues/audit-export.queue.js";
import { TYPES } from "../../types.js";
import { FileService, FileServiceError } from "../files/file.service.js";
import {
  AUDIT_EXPORT_JOB,
  AUDIT_EXPORT_PAGE_SIZE,
  AUDIT_SYNC_EXPORT_MAX_ROWS,
} from "./audit-export.constants.js";
import { auditHitsToCsv, auditHitsToJson } from "./audit-export-csv.js";
import { sendAuditExportReadyEmail } from "./audit-export.email.js";
import { AuditService } from "./audit.service.js";
import type {
  AuditExportAsyncResult,
  AuditExportFilters,
  AuditExportFormat,
  AuditExportJobParams,
  AuditExportParams,
  AuditExportResult,
  AuditExportSyncResult,
  AuditEventSearchHit,
  AuditSearchParams,
} from "./audit.types.js";

export class AuditExportError extends Error {
  constructor(
    message: string,
    readonly code:
      | "email_required"
      | "s3_required"
      | "opensearch_unavailable"
      | "invalid_range",
  ) {
    super(message);
    this.name = "AuditExportError";
  }
}

function toSearchParams(filters: AuditExportFilters): AuditSearchParams {
  return {
    ...(filters.q !== undefined ? { q: filters.q } : {}),
    ...(filters.from !== undefined ? { from: filters.from } : {}),
    ...(filters.to !== undefined ? { to: filters.to } : {}),
    ...(filters.actor_id !== undefined ? { actor_id: filters.actor_id } : {}),
    ...(filters.action !== undefined ? { action: filters.action } : {}),
    ...(filters.resource_type !== undefined
      ? { resource_type: filters.resource_type }
      : {}),
    ...(filters.resource_id !== undefined ? { resource_id: filters.resource_id } : {}),
    include_aggs: false,
  };
}

@injectable()
export class AuditExportService {
  constructor(
    @inject(TYPES.AuditService) private readonly audit: AuditService,
    @inject(TYPES.FileService) private readonly files: FileService,
  ) {}

  /**
   * Export audit logs for external analysis.
   * ≤10k rows: sync CSV/JSON response body.
   * >10k rows: BullMQ job, S3 object, presigned URL emailed to `params.email`.
   */
  async exportAuditLogs(
    orgId: string,
    params: AuditExportParams,
    options?: { requestedByUserId?: string },
  ): Promise<AuditExportResult> {
    if (
      params.from !== undefined &&
      params.to !== undefined &&
      params.from.getTime() > params.to.getTime()
    ) {
      throw new AuditExportError("from must be before to", "invalid_range");
    }

    const estimatedRows = await this.estimateRowCount(orgId, params);

    if (estimatedRows > AUDIT_SYNC_EXPORT_MAX_ROWS) {
      return this.enqueueLargeExport(orgId, params, estimatedRows, options);
    }

    const hits = await this.fetchAllHits(orgId, params);
    return this.buildSyncResult(params.format, hits);
  }

  /** Background worker entry — fetch, upload, presign, notify. */
  async processExportJob(
    orgId: string,
    jobParams: AuditExportJobParams,
    notifyEmail: string,
  ): Promise<{ s3Key: string; downloadUrl: string; total: number }> {
    const filters = this.jobParamsToFilters(jobParams);
    const hits = await this.fetchAllHits(orgId, filters);
    const { body, contentType, extension } = this.serializeExport(jobParams.format, hits);
    const s3Key = await this.files.uploadAuditExport(orgId, body, extension, contentType);
    const { url } = await this.files.getDownloadUrl(orgId, s3Key);

    await sendAuditExportReadyEmail({
      to: notifyEmail,
      downloadUrl: url,
      format: jobParams.format,
      total: hits.length,
    });

    await this.audit.log({
      org_id: orgId,
      action: "audit.export.completed",
      resource: {
        type: "audit_export",
        id: new Types.ObjectId(),
        name: s3Key,
      },
      metadata: {
        format: jobParams.format,
        total: hits.length,
        s3_key: s3Key,
        notify_email: notifyEmail,
      },
    });

    return { s3Key, downloadUrl: url, total: hits.length };
  }

  async estimateRowCount(orgId: string, filters: AuditExportFilters): Promise<number> {
    const result = await this.audit.search(orgId, {
      ...toSearchParams(filters),
      page: 1,
      limit: 1,
    });
    return result.total;
  }

  private async enqueueLargeExport(
    orgId: string,
    params: AuditExportParams,
    estimatedRows: number,
    options?: { requestedByUserId?: string },
  ): Promise<AuditExportAsyncResult> {
    const email = params.email?.trim();
    if (email === undefined || email.length === 0) {
      throw new AuditExportError(
        `email is required when export exceeds ${AUDIT_SYNC_EXPORT_MAX_ROWS} rows (estimated ${estimatedRows})`,
        "email_required",
      );
    }

    try {
      this.files.assertS3Configured();
    } catch {
      throw new AuditExportError(
        "S3 is required for large audit exports",
        "s3_required",
      );
    }

    const jobParams: AuditExportJobParams = {
      format: params.format,
      ...(params.q !== undefined ? { q: params.q } : {}),
      ...(params.from !== undefined ? { from: params.from.toISOString() } : {}),
      ...(params.to !== undefined ? { to: params.to.toISOString() } : {}),
      ...(params.actor_id !== undefined ? { actor_id: params.actor_id } : {}),
      ...(params.action !== undefined ? { action: params.action } : {}),
      ...(params.resource_type !== undefined
        ? { resource_type: params.resource_type }
        : {}),
      ...(params.resource_id !== undefined ? { resource_id: params.resource_id } : {}),
    };

    const job = await auditExportQueue.add(AUDIT_EXPORT_JOB, {
      orgId,
      params: jobParams,
      notifyEmail: email,
      ...(options?.requestedByUserId !== undefined
        ? { requestedByUserId: options.requestedByUserId }
        : {}),
    });

    await this.audit.log({
      org_id: orgId,
      action: "audit.export.queued",
      resource: {
        type: "audit_export",
        id: new Types.ObjectId(),
        name: String(job.id),
      },
      metadata: {
        format: params.format,
        estimated_rows: estimatedRows,
        job_id: String(job.id),
        notify_email: email,
      },
    });

    return {
      mode: "async",
      jobId: String(job.id),
      status: "processing",
      total: estimatedRows,
    };
  }

  private async fetchAllHits(
    orgId: string,
    filters: AuditExportFilters,
  ): Promise<AuditEventSearchHit[]> {
    const base = toSearchParams(filters);
    const all: AuditEventSearchHit[] = [];
    let page = 1;
    let pages = 1;

    do {
      const result = await this.audit.search(orgId, {
        ...base,
        page,
        limit: AUDIT_EXPORT_PAGE_SIZE,
      });
      all.push(...result.hits);
      pages = result.pages;
      page += 1;
    } while (page <= pages);

    return all;
  }

  private buildSyncResult(
    format: AuditExportFormat,
    hits: AuditEventSearchHit[],
  ): AuditExportSyncResult {
    const { body } = this.serializeExport(format, hits);
    return {
      mode: "sync",
      format,
      total: hits.length,
      content: body.toString("utf8"),
    };
  }

  private serializeExport(
    format: AuditExportFormat,
    hits: AuditEventSearchHit[],
  ): { body: Buffer; contentType: string; extension: "csv" | "json" } {
    if (format === "csv") {
      return {
        body: Buffer.from(auditHitsToCsv(hits), "utf8"),
        contentType: "text/csv",
        extension: "csv",
      };
    }
    return {
      body: Buffer.from(JSON.stringify(auditHitsToJson(hits), null, 2), "utf8"),
      contentType: "application/json",
      extension: "json",
    };
  }

  private jobParamsToFilters(params: AuditExportJobParams): AuditExportFilters {
    const from = params.from !== undefined ? new Date(params.from) : undefined;
    const to = params.to !== undefined ? new Date(params.to) : undefined;
    if (from !== undefined && Number.isNaN(from.getTime())) {
      throw new AuditExportError("Invalid from date in export job", "invalid_range");
    }
    if (to !== undefined && Number.isNaN(to.getTime())) {
      throw new AuditExportError("Invalid to date in export job", "invalid_range");
    }
    return {
      ...(params.q !== undefined ? { q: params.q } : {}),
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {}),
      ...(params.actor_id !== undefined ? { actor_id: params.actor_id } : {}),
      ...(params.action !== undefined ? { action: params.action } : {}),
      ...(params.resource_type !== undefined
        ? { resource_type: params.resource_type }
        : {}),
      ...(params.resource_id !== undefined ? { resource_id: params.resource_id } : {}),
    };
  }
}
