import { inject, injectable } from "inversify";
import { Types } from "mongoose";

import { config } from "@config/index.js";
import {
  AUDIT_INDEX_PATTERN,
  requireOpenSearchClient,
} from "../../infrastructure/search/index.js";
import { TYPES } from "../../types.js";
import { AuditLogModel, type IAuditLog } from "../audit/audit.model.js";
import { FileService } from "../files/file.service.js";
import { OrganizationRepository } from "../organization/organization.repository.js";
import {
  RETENTION_BATCH_SIZE,
} from "./retention.constants.js";
import {
  computeRetentionCutoff,
  defaultArchiveLocation,
  normalizeArchiveLocation,
  resolveEffectivePolicy,
  validateRetentionDays,
} from "./retention.logic.js";
import {
  RetentionPolicyModel,
  RetentionRunModel,
  type IRetentionPolicy,
  type IRetentionRun,
  type RetentionRunStatus,
} from "./retention.model.js";

export type RetentionPolicyView = {
  org_id: string;
  audit_retention_days: number;
  archive_before_delete: boolean;
  archive_location: string;
  is_default: boolean;
  min_retention_days: number;
  max_retention_days: number;
  updated_at: string | null;
};

export type ComplianceReport = {
  org_id: string;
  generated_at: string;
  policy: RetentionPolicyView;
  cutoff: string;
  counts: {
    within_retention: number;
    past_cutoff: number;
    archived_total: number;
  };
  last_run: {
    started_at: string;
    completed_at: string | null;
    status: RetentionRunStatus;
    archived_count: number;
    deleted_mongo_count: number;
    deleted_opensearch_count: number;
    archive_s3_keys: string[];
    error_message: string | null;
  } | null;
  compliance_status: "compliant" | "action_required";
  notes: string[];
};

export type OrgRetentionResult = {
  org_id: string;
  archived: number;
  deleted_mongo: number;
  deleted_opensearch: number;
  archive_keys: string[];
  status: RetentionRunStatus;
  error?: string;
};

@injectable()
export class RetentionService {
  constructor(
    @inject(TYPES.OrganizationRepository)
    private readonly organizations: OrganizationRepository,
    @inject(TYPES.FileService) private readonly files: FileService,
  ) {}

  getMaxRetentionDays(): number {
    return config.retention.maxAuditDays;
  }

  async getPolicyForOrg(orgId: string): Promise<RetentionPolicyView> {
    const stored = await RetentionPolicyModel.findOne({
      org_id: new Types.ObjectId(orgId),
    }).lean<IRetentionPolicy | null>();

    const effective = resolveEffectivePolicy(orgId, stored);
    return {
      org_id: orgId,
      ...effective,
      min_retention_days: 365,
      max_retention_days: this.getMaxRetentionDays(),
      updated_at: stored?.updated_at?.toISOString() ?? null,
    };
  }

  async upsertPolicy(
    orgId: string,
    input: {
      audit_retention_days: number;
      archive_before_delete: boolean;
      archive_location?: string;
    },
  ): Promise<RetentionPolicyView> {
    validateRetentionDays(input.audit_retention_days, this.getMaxRetentionDays());
    const archiveLocation = normalizeArchiveLocation(orgId, input.archive_location);

    if (input.archive_before_delete) {
      this.files.assertS3Configured();
    }

    const orgOid = new Types.ObjectId(orgId);
    await RetentionPolicyModel.findOneAndUpdate(
      { org_id: orgOid },
      {
        org_id: orgOid,
        audit_retention_days: input.audit_retention_days,
        archive_before_delete: input.archive_before_delete,
        archive_location: archiveLocation,
      },
      { upsert: true, new: true, runValidators: true },
    );

    return this.getPolicyForOrg(orgId);
  }

  /** Daily job — apply retention policy for every organization. */
  async processRetention(): Promise<OrgRetentionResult[]> {
    const orgs = await this.organizations.list();
    const results: OrgRetentionResult[] = [];

    for (const org of orgs) {
      if (org.status === "suspended") {
        continue;
      }
      const orgId = String(org._id);
      try {
        results.push(await this.processOrgRetention(orgId));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        process.stderr.write(`[retention] org=${orgId} failed: ${message}\n`);
        results.push({
          org_id: orgId,
          archived: 0,
          deleted_mongo: 0,
          deleted_opensearch: 0,
          archive_keys: [],
          status: "failed",
          error: message,
        });
      }
    }

    return results;
  }

  async processOrgRetention(orgId: string): Promise<OrgRetentionResult> {
    const policyView = await this.getPolicyForOrg(orgId);
    const cutoff = computeRetentionCutoff(new Date(), policyView.audit_retention_days);
    const run = await RetentionRunModel.create({
      org_id: new Types.ObjectId(orgId),
      started_at: new Date(),
      cutoff,
      audit_retention_days: policyView.audit_retention_days,
      archived_count: 0,
      deleted_mongo_count: 0,
      deleted_opensearch_count: 0,
      archive_s3_keys: [],
      status: "completed",
    });

    let archived = 0;
    let deletedMongo = 0;
    let deletedOpenSearch = 0;
    const archiveKeys: string[] = [];
    let status: RetentionRunStatus = "completed";
    let errorMessage: string | undefined;

    try {
      if (policyView.archive_before_delete) {
        const archiveResult = await this.archiveOldLogs(
          orgId,
          cutoff,
          policyView.archive_location,
        );
        archived = archiveResult.archived;
        archiveKeys.push(...archiveResult.s3Keys);
      }

      deletedMongo = await this.deleteOldMongoLogs(orgId, cutoff);
      deletedOpenSearch = await this.deleteOldOpenSearchLogs(orgId, cutoff);
    } catch (e) {
      status = archived > 0 || deletedMongo > 0 ? "partial" : "failed";
      errorMessage = e instanceof Error ? e.message : String(e);
      process.stderr.write(`[retention] org=${orgId} error: ${errorMessage}\n`);
    }

    await RetentionRunModel.findByIdAndUpdate(run._id, {
      completed_at: new Date(),
      archived_count: archived,
      deleted_mongo_count: deletedMongo,
      deleted_opensearch_count: deletedOpenSearch,
      archive_s3_keys: archiveKeys,
      status,
      ...(errorMessage !== undefined ? { error_message: errorMessage } : {}),
    });

    return {
      org_id: orgId,
      archived,
      deleted_mongo: deletedMongo,
      deleted_opensearch: deletedOpenSearch,
      archive_keys: archiveKeys,
      status,
      ...(errorMessage !== undefined ? { error: errorMessage } : {}),
    };
  }

  async generateComplianceReport(orgId: string): Promise<ComplianceReport> {
    const policy = await this.getPolicyForOrg(orgId);
    const cutoff = computeRetentionCutoff(new Date(), policy.audit_retention_days);
    const orgOid = new Types.ObjectId(orgId);

    const [withinRetention, pastCutoff, lastRun, archivedTotal] = await Promise.all([
      AuditLogModel.countDocuments({
        org_id: orgOid,
        timestamp: { $gte: cutoff },
      }),
      AuditLogModel.countDocuments({
        org_id: orgOid,
        timestamp: { $lt: cutoff },
      }),
      RetentionRunModel.findOne({ org_id: orgOid })
        .sort({ started_at: -1 })
        .lean<IRetentionRun | null>(),
      RetentionRunModel.aggregate<{ total: number }>([
        { $match: { org_id: orgOid } },
        { $group: { _id: null, total: { $sum: "$archived_count" } } },
      ]).then((rows) => rows[0]?.total ?? 0),
    ]);

    const notes: string[] = [];
    if (policy.is_default) {
      notes.push("Using platform default retention policy (3 years, archive before delete).");
    }
    if (pastCutoff > 0) {
      notes.push(
        `${pastCutoff} audit log(s) are past the retention cutoff and await the next daily sweep.`,
      );
    }
    if (policy.archive_before_delete && !config.s3) {
      notes.push("S3 is not configured — archival will be skipped until S3_FILES_* is set.");
    }

    const complianceStatus: ComplianceReport["compliance_status"] =
      pastCutoff === 0 ? "compliant" : "action_required";

    return {
      org_id: orgId,
      generated_at: new Date().toISOString(),
      policy,
      cutoff: cutoff.toISOString(),
      counts: {
        within_retention: withinRetention,
        past_cutoff: pastCutoff,
        archived_total: archivedTotal,
      },
      last_run: lastRun
        ? {
            started_at: lastRun.started_at.toISOString(),
            completed_at: lastRun.completed_at?.toISOString() ?? null,
            status: lastRun.status,
            archived_count: lastRun.archived_count,
            deleted_mongo_count: lastRun.deleted_mongo_count,
            deleted_opensearch_count: lastRun.deleted_opensearch_count,
            archive_s3_keys: lastRun.archive_s3_keys,
            error_message: lastRun.error_message ?? null,
          }
        : null,
      compliance_status: complianceStatus,
      notes,
    };
  }

  /** BullMQ notification job entry point. */
  async processDailyRetentionJob(): Promise<void> {
    const results = await this.processRetention();
    const failed = results.filter((r) => r.status === "failed").length;
    const partial = results.filter((r) => r.status === "partial").length;
    process.stdout.write(
      `[retention] daily scan orgs=${results.length} failed=${failed} partial=${partial}\n`,
    );
  }

  private async archiveOldLogs(
    orgId: string,
    cutoff: Date,
    archiveLocation: string,
  ): Promise<{ archived: number; s3Keys: string[] }> {
    this.files.assertS3Configured();
    const orgOid = new Types.ObjectId(orgId);
    let archived = 0;
    const s3Keys: string[] = [];

    for (;;) {
      const batch = await AuditLogModel.find({
        org_id: orgOid,
        timestamp: { $lt: cutoff },
      })
        .sort({ timestamp: 1 })
        .limit(RETENTION_BATCH_SIZE)
        .lean<IAuditLog[]>();

      if (batch.length === 0) {
        break;
      }

      const body = Buffer.from(
        batch.map((doc) => JSON.stringify(doc)).join("\n"),
        "utf8",
      );
      const key = await this.files.uploadAuditArchive(
        orgId,
        body,
        archiveLocation,
      );
      s3Keys.push(key);
      archived += batch.length;
    }

    return { archived, s3Keys };
  }

  /**
   * Compliance-mandated deletion bypasses Mongoose immutability hooks via the native collection.
   */
  private async deleteOldMongoLogs(orgId: string, cutoff: Date): Promise<number> {
    const orgOid = new Types.ObjectId(orgId);
    let total = 0;

    for (;;) {
      const batch = await AuditLogModel.find({
        org_id: orgOid,
        timestamp: { $lt: cutoff },
      })
        .select({ _id: 1 })
        .limit(RETENTION_BATCH_SIZE)
        .lean<Array<{ _id: Types.ObjectId }>>();

      if (batch.length === 0) {
        break;
      }

      const ids = batch.map((b) => b._id);
      const result = await AuditLogModel.collection.deleteMany({
        _id: { $in: ids },
      });
      total += result.deletedCount ?? 0;
    }

    return total;
  }

  private async deleteOldOpenSearchLogs(orgId: string, cutoff: Date): Promise<number> {
    try {
      const client = requireOpenSearchClient();
      const res = await client.deleteByQuery({
        index: AUDIT_INDEX_PATTERN,
        body: {
          query: {
            bool: {
              must: [
                { term: { org_id: orgId } },
                { range: { timestamp: { lt: cutoff.toISOString() } } },
              ],
            },
          },
        },
        conflicts: "proceed",
        refresh: false,
      });

      const deleted =
        typeof res.body.deleted === "number"
          ? res.body.deleted
          : Number(res.body.total ?? 0);
      return deleted;
    } catch (e) {
      process.stderr.write(
        `[retention] OpenSearch delete_by_query org=${orgId}: ${String(e)}\n`,
      );
      return 0;
    }
  }
}

export { defaultArchiveLocation };
