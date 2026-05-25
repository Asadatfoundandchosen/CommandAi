import type { AuditSearchParams } from "./audit.types.js";

const FULL_TEXT_FIELDS = [
  "action",
  "resource",
  "resource_type",
  "resource_id",
  "resource_name",
  "user_id",
  "actor_id",
  "actor_email",
  "user_agent",
  "request_id",
  "trace_id",
  "ip_address",
];

export type AuditSearchQueryBody = {
  query: Record<string, unknown>;
  sort: Array<Record<string, unknown>>;
  size: number;
  from: number;
  aggs?: Record<string, unknown>;
};

/** Build OpenSearch query body for tenant-scoped audit search. */
export function buildAuditSearchQueryBody(
  orgId: string,
  params: AuditSearchParams,
): AuditSearchQueryBody {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 500);
  const page = Math.max(params.page ?? 1, 1);
  const from = (page - 1) * limit;

  const must: object[] = [{ term: { org_id: orgId } }];
  const filter: object[] = [];

  if (params.from !== undefined || params.to !== undefined) {
    filter.push({
      range: {
        timestamp: {
          ...(params.from !== undefined ? { gte: params.from.toISOString() } : {}),
          ...(params.to !== undefined ? { lte: params.to.toISOString() } : {}),
        },
      },
    });
  }

  if (params.actor_id !== undefined && params.actor_id.length > 0) {
    must.push({
      bool: {
        should: [
          { term: { actor_id: params.actor_id } },
          { term: { user_id: params.actor_id } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  if (params.action !== undefined && params.action.trim().length > 0) {
    const action = params.action.trim();
    must.push({
      wildcard: {
        action: {
          value: action.includes("*") ? action : `*${action}*`,
          case_insensitive: true,
        },
      },
    });
  }

  if (params.resource_type !== undefined && params.resource_type.trim().length > 0) {
    must.push({ term: { resource_type: params.resource_type.trim() } });
  }

  if (params.resource_id !== undefined && params.resource_id.length > 0) {
    must.push({ term: { resource_id: params.resource_id } });
  }

  const q = params.q?.trim();
  if (q !== undefined && q.length > 0) {
    must.push({
      multi_match: {
        query: q,
        fields: FULL_TEXT_FIELDS,
        type: "best_fields",
        operator: "and",
      },
    });
  }

  const body: AuditSearchQueryBody = {
    query: {
      bool: {
        must,
        ...(filter.length > 0 ? { filter } : {}),
      },
    },
    sort: [{ timestamp: { order: "desc" } }],
    size: limit,
    from,
  };

  if (params.include_aggs !== false) {
    body.aggs = {
      by_action: { terms: { field: "action", size: 50 } },
      by_actor: { terms: { field: "actor_id", size: 50 } },
      by_resource_type: { terms: { field: "resource_type", size: 50 } },
      events_over_time: {
        date_histogram: {
          field: "timestamp",
          calendar_interval: "day",
          min_doc_count: 0,
        },
      },
    };
  }

  return body;
}

export function parseTermsAgg(
  buckets: Array<{ key: string; doc_count: number }> | undefined,
): Array<{ key: string; count: number }> {
  if (!buckets) {
    return [];
  }
  return buckets.map((b) => ({ key: String(b.key), count: b.doc_count }));
}

export function parseDateHistogramAgg(
  buckets: Array<{ key_as_string?: string; key: number; doc_count: number }> | undefined,
): Array<{ key: string; count: number }> {
  if (!buckets) {
    return [];
  }
  return buckets.map((b) => ({
    key: b.key_as_string ?? new Date(b.key).toISOString(),
    count: b.doc_count,
  }));
}
