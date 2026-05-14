import { injectable } from "inversify";

import {
  AUDIT_INDEX_PATTERN,
  auditIndexName,
  requireOpenSearchClient,
} from "../../infrastructure/search/index.js";
import type {
  AuditEventDocument,
  AuditEventSearchHit,
  AuditEventSearchParams,
} from "./audit.types.js";

/**
 * All audit writes use OpenSearch **index** with `op_type: "create"` only.
 * Re-using the same `id` returns **409** — documents are **not** updated in place.
 */
export const AUDIT_WRITE_OP_TYPE = "create" as const;

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

@injectable()
export class AuditService {
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
   * Search **`audit-*`** with tenant filter on `org_id` and optional text / time range.
   */
  async searchAuditEvents(
    params: AuditEventSearchParams,
  ): Promise<AuditEventSearchHit[]> {
    const c = requireOpenSearchClient();
    const size = Math.min(Math.max(params.size ?? 25, 1), 500);
    const must: object[] = [{ term: { org_id: params.org_id } }];
    if (params.queryText !== undefined && params.queryText.trim().length > 0) {
      must.push({
        simple_query_string: {
          query: params.queryText,
          fields: ["action", "resource", "resource_id", "user_id", "user_agent"],
          default_operator: "and",
        },
      });
    }
    if (params.from !== undefined || params.to !== undefined) {
      must.push({
        range: {
          timestamp: {
            ...(params.from !== undefined
              ? { gte: params.from.toISOString() }
              : {}),
            ...(params.to !== undefined ? { lte: params.to.toISOString() } : {}),
          },
        },
      });
    }
    const res = await c.search({
      index: AUDIT_INDEX_PATTERN,
      body: {
        size,
        sort: [{ timestamp: { order: "desc" } }],
        query: { bool: { must } },
      },
    });
    const hits = res.body.hits?.hits ?? [];
    return hits.map(
      (h: {
        _id?: string;
        _score?: number | null;
        _source?: Record<string, unknown>;
      }) => ({
        _id: String(h._id),
        _score: h._score ?? null,
        _source: (h._source ?? {}) as Record<string, unknown>,
      }),
    );
  }
}
