import { randomUUID } from "node:crypto";

import { injectable } from "inversify";
import type { Request } from "express";
import { Types } from "mongoose";

import { getAuditContext } from "@common/audit/audit-context.js";
import { buildAuditChanges } from "@common/audit/track-changes.js";
import { resolveClientIp } from "@modules/auth/client-context.js";
import {
  AUDIT_INDEX_PATTERN,
  auditIndexName,
  requireOpenSearchClient,
} from "../../infrastructure/search/index.js";
import {
  AuditLogModel,
  type AuditActor,
  type AuditActorType,
  type IAuditLog,
} from "./audit.model.js";
import type {
  AuditEvent,
  AuditEventDocument,
  AuditEventSearchHit,
  AuditEventSearchParams,
  AuditSearchParams,
  AuditSearchResult,
} from "./audit.types.js";
import {
  buildAuditSearchQueryBody,
  parseDateHistogramAgg,
  parseTermsAgg,
} from "./audit-search.query.js";
import { AuditIntegrityService } from "./audit-integrity.service.js";

/**
 * All audit writes use OpenSearch **index** with `op_type: "create"` only.
 * Re-using the same `id` returns **409** — documents are **not** updated in place.
 */
export const AUDIT_WRITE_OP_TYPE = "create" as const;

const SYSTEM_ACTOR_ID = new Types.ObjectId("000000000000000000000000");

function toIndexBody(
  doc: AuditEventDocument,
  eventTime: Date,
): Record<string, unknown> {
  return {
    ...doc,
    timestamp: doc.timestamp ?? eventTime.toISOString(),
  };
}

/**
 * Parameters passed to `client.index` — **create** only, for tests and invariants.
 */
export function buildAuditCreateIndexRequest(
  doc: AuditEventDocument,
  options?: { id?: string; forDate?: Date },
): {
  index: string;
  op_type: typeof AUDIT_WRITE_OP_TYPE;
  body: Record<string, unknown>;
  refresh: boolean;
  id?: string;
} {
  const forDate = options?.forDate ?? new Date();
  const body = toIndexBody(doc, forDate);
  return {
    index: auditIndexName(forDate),
    op_type: AUDIT_WRITE_OP_TYPE,
    body,
    refresh: false,
    ...(options?.id !== undefined ? { id: options.id } : {}),
  };
}

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  return value instanceof Types.ObjectId ? value : new Types.ObjectId(value);
}

export function auditLogToSearchDocument(log: IAuditLog): AuditEventDocument {
  const actorId = String(log.actor.id);
  const resourceType = log.resource.type;
  const resourceId = String(log.resource.id);
  return {
    timestamp: log.timestamp.toISOString(),
    org_id: String(log.org_id),
    actor_type: log.actor.type,
    actor_id: actorId,
    actor_email: log.actor.email,
    user_id: log.actor.type === "user" ? actorId : undefined,
    action: log.action,
    resource_type: resourceType,
    resource_id: resourceId,
    resource_name: log.resource.name,
    resource: resourceType,
    changes: log.changes,
    ip_address: log.actor.ip_address,
    user_agent: log.actor.user_agent,
    metadata: log.metadata,
    request_id: log.request_id,
    trace_id: log.trace_id,
    actor: log.actor,
    resource_obj: log.resource,
    ...(log.checksum !== undefined ? { checksum: log.checksum } : {}),
  };
}

@injectable()
export class AuditService {
  private readonly integrity = new AuditIntegrityService();

  extractActor(req?: Request): AuditActor {
    if (req?.user?.sub) {
      return {
        type: "user",
        id: new Types.ObjectId(req.user.sub),
        ip_address: resolveClientIp(req),
        user_agent: req.get("user-agent") ?? "unknown",
      };
    }
    if (req?.apiKeyId) {
      return {
        type: "api_key",
        id: new Types.ObjectId(req.apiKeyId),
        ip_address: resolveClientIp(req),
        user_agent: req.get("user-agent") ?? "unknown",
      };
    }
    return {
      type: "system",
      id: SYSTEM_ACTOR_ID,
      ip_address: req ? resolveClientIp(req) : "0.0.0.0",
      user_agent: req?.get("user-agent") ?? "system",
    };
  }

  /**
   * Persist audit event to MongoDB and index to OpenSearch (append-only).
   */
  async log(event: AuditEvent): Promise<IAuditLog | null> {
    const ctx = getAuditContext();
    const req = ctx?.req;
    const orgIdRaw = event.org_id ?? req?.tenantId ?? req?.user?.org_id;
    if (orgIdRaw == null) {
      process.stderr.write(
        `[audit] skipped event ${event.action}: missing org_id\n`,
      );
      return null;
    }

    const actor = event.actor ?? this.extractActor(req);
    const timestamp = new Date();
    const requestId =
      event.request_id ?? ctx?.requestId ?? req?.get("x-request-id") ?? randomUUID();
    const traceId = event.trace_id ?? ctx?.traceId;

    const payload: Omit<IAuditLog, "_id"> = this.integrity.attachChecksum({
      timestamp,
      org_id: toObjectId(orgIdRaw),
      actor,
      action: event.action,
      resource: event.resource,
      ...(event.changes !== undefined ? { changes: event.changes } : {}),
      ...(event.metadata !== undefined ? { metadata: event.metadata } : {}),
      request_id: requestId,
      ...(traceId !== undefined ? { trace_id: traceId } : {}),
    });

    const logDoc = new AuditLogModel(payload);
    logDoc.$locals.auditSkip = true;
    await logDoc.save();

    try {
      await this.indexAuditEvent(auditLogToSearchDocument(logDoc.toObject()), {
        id: String(logDoc._id),
        forDate: timestamp,
      });
    } catch (e) {
      process.stderr.write(`[audit] OpenSearch index failed: ${String(e)}\n`);
    }

    return logDoc.toObject();
  }

  /**
   * Log a mutation with before/after snapshots and field-level `changes.diff`.
   */
  async logChange(params: {
    org_id: Types.ObjectId | string;
    action: string;
    resource: AuditEvent["resource"];
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    metadata?: Record<string, unknown>;
    actor?: AuditActor;
    request_id?: string;
    trace_id?: string;
  }): Promise<IAuditLog | null> {
    const changes = buildAuditChanges(params.before, params.after);
    return this.log({
      org_id: params.org_id,
      action: params.action,
      resource: params.resource,
      ...(changes !== undefined ? { changes } : {}),
      ...(params.metadata !== undefined ? { metadata: params.metadata } : {}),
      ...(params.actor !== undefined ? { actor: params.actor } : {}),
      ...(params.request_id !== undefined ? { request_id: params.request_id } : {}),
      ...(params.trace_id !== undefined ? { trace_id: params.trace_id } : {}),
    });
  }

  /** Change history for a single resource (newest first). */
  async getChangeHistory(
    orgId: string,
    resourceType: string,
    resourceId: string,
    options?: { limit?: number; skip?: number },
  ): Promise<IAuditLog[]> {
    const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
    const skip = Math.max(options?.skip ?? 0, 0);

    const rows = await AuditLogModel.find({
      org_id: toObjectId(orgId),
      "resource.type": resourceType,
      "resource.id": toObjectId(resourceId),
    })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean<IAuditLog[]>();

    for (const row of rows) {
      this.integrity.verifyMongoLog(row);
    }

    return rows;
  }

  /**
   * **Append-only** index of an audit event. No updates: duplicate `id` (if any) fails with **version conflict**.
   */
  async indexAuditEvent(
    doc: AuditEventDocument,
    options?: { id?: string; forDate?: Date },
  ): Promise<void> {
    const c = requireOpenSearchClient();
    const req = buildAuditCreateIndexRequest(doc, options);
    await c.index(req);
  }

  /**
   * Full-text search over **`audit-*`** with filters, pagination, and chart aggregations.
   */
  async search(orgId: string, params: AuditSearchParams): Promise<AuditSearchResult> {
    const c = requireOpenSearchClient();
    const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
    const page = Math.max(params.page ?? 1, 1);
    const body = buildAuditSearchQueryBody(orgId, params);

    const res = await c.search({
      index: AUDIT_INDEX_PATTERN,
      body: {
        track_total_hits: true,
        ...body,
      },
    });

    const rawHits = res.body.hits?.hits ?? [];
    const hits = rawHits.map(
      (h: {
        _id?: string;
        _score?: number | null;
        _source?: Record<string, unknown>;
      }) => {
        const source = (h._source ?? {}) as AuditEventDocument & { checksum?: string };
        const integrityValid = this.integrity.verifySearchDocument(
          source,
          String(h._id),
        );
        return {
          _id: String(h._id),
          _score: h._score ?? null,
          _source: h._source ?? {},
          integrity_valid: integrityValid,
        };
      },
    );

    const totalRaw = res.body.hits?.total;
    const total =
      typeof totalRaw === "number"
        ? totalRaw
        : typeof totalRaw === "object" && totalRaw !== null && "value" in totalRaw
          ? Number((totalRaw as { value: number }).value)
          : hits.length;

    const aggs = res.body.aggregations as
      | {
          by_action?: { buckets?: Array<{ key: string; doc_count: number }> };
          by_actor?: { buckets?: Array<{ key: string; doc_count: number }> };
          by_resource_type?: { buckets?: Array<{ key: string; doc_count: number }> };
          events_over_time?: {
            buckets?: Array<{ key_as_string?: string; key: number; doc_count: number }>;
          };
        }
      | undefined;

    const result: AuditSearchResult = {
      hits,
      total,
      page,
      limit,
      pages: total === 0 ? 0 : Math.ceil(total / limit),
    };

    if (params.include_aggs !== false && aggs !== undefined) {
      result.aggregations = {
        by_action: parseTermsAgg(aggs.by_action?.buckets),
        by_actor: parseTermsAgg(aggs.by_actor?.buckets),
        by_resource_type: parseTermsAgg(aggs.by_resource_type?.buckets),
        events_over_time: parseDateHistogramAgg(aggs.events_over_time?.buckets),
      };
    }

    return result;
  }

  /**
   * Search **`audit-*`** with tenant filter on `org_id` and optional text / time range.
   * @deprecated Prefer `search()` — retained for internal callers.
   */
  async searchAuditEvents(
    params: AuditEventSearchParams,
  ): Promise<AuditEventSearchHit[]> {
    const result = await this.search(params.org_id, {
      ...(params.queryText !== undefined ? { q: params.queryText } : {}),
      ...(params.from !== undefined ? { from: params.from } : {}),
      ...(params.to !== undefined ? { to: params.to } : {}),
      limit: params.size ?? 25,
      page: 1,
      include_aggs: false,
    });
    return result.hits;
  }
}

export type { AuditActorType };
