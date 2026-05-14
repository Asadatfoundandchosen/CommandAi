/**
 * OpenSearch document shape for **`audit-*`** indices (see `infrastructure/opensearch/audit-index-template.json`).
 * Field names use **snake_case** to match the structured mapping.
 */
export type AuditEventDocument = {
  /** Event time; stored as OpenSearch `date` (ISO-8601). Defaults to "now" when omitted at index time. */
  timestamp?: string;
  org_id: string;
  user_id?: string;
  action: string;
  resource: string;
  resource_id?: string;
  /** Stored, not indexed (`enabled: false` on `changes` in the template). */
  changes?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
};

export type AuditEventSearchParams = {
  org_id: string;
  queryText?: string;
  from?: Date;
  to?: Date;
  size?: number;
};

export type AuditEventSearchHit = {
  _id: string;
  _score: number | null;
  _source: Record<string, unknown>;
};
