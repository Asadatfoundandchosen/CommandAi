import type { Types } from "mongoose";

import type {
  AuditActor,
  AuditChanges,
  AuditResource,
} from "./audit.model.js";

/** Input to `AuditService.log` — org and actor resolved from context when omitted. */
export type AuditEvent = {
  org_id?: Types.ObjectId | string;
  action: string;
  resource: AuditResource;
  changes?: AuditChanges;
  metadata?: Record<string, unknown>;
  request_id?: string;
  trace_id?: string;
  actor?: AuditActor;
};

/**
 * OpenSearch document shape for **`audit-*`** indices (see `infrastructure/opensearch/audit-index-template.json`).
 * Includes flattened fields for search compatibility plus nested actor/resource.
 */
export type AuditEventDocument = {
  timestamp?: string;
  org_id: string;
  /** Flattened actor fields for keyword search. */
  actor_type?: string;
  actor_id?: string;
  actor_email?: string;
  /** @deprecated Legacy field — populated from `actor.id` for user actors. */
  user_id?: string;
  action: string;
  /** Flattened resource fields. */
  resource_type?: string;
  resource_id?: string;
  resource_name?: string;
  /** @deprecated Legacy field — same as `resource_type`. */
  resource?: string;
  changes?: AuditChanges | Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  metadata?: Record<string, unknown>;
  request_id?: string;
  trace_id?: string;
  actor?: AuditActor;
  resource_obj?: AuditResource;
  /** SHA-256 integrity checksum (see `createAuditChecksum`). */
  checksum?: string;
};

export type AuditEventSearchParams = {
  org_id: string;
  queryText?: string;
  from?: Date;
  to?: Date;
  size?: number;
};

/** Full-text audit search with filters, pagination, and chart aggregations. */
export type AuditSearchParams = {
  q?: string;
  from?: Date;
  to?: Date;
  actor_id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
  page?: number;
  limit?: number;
  /** Include dashboard aggregations (default true). */
  include_aggs?: boolean;
};

export type AuditSearchAggregationBucket = {
  key: string;
  count: number;
};

export type AuditSearchAggregations = {
  by_action: AuditSearchAggregationBucket[];
  by_actor: AuditSearchAggregationBucket[];
  by_resource_type: AuditSearchAggregationBucket[];
  events_over_time: AuditSearchAggregationBucket[];
};

export type AuditSearchResult = {
  hits: AuditEventSearchHit[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  aggregations?: AuditSearchAggregations;
};

export type AuditEventSearchHit = {
  _id: string;
  _score: number | null;
  _source: Record<string, unknown>;
  /** False when stored checksum does not match recomputed hash. */
  integrity_valid?: boolean;
};

/** Filters shared by audit search and export (no pagination). */
export type AuditExportFilters = {
  q?: string;
  from?: Date;
  to?: Date;
  actor_id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
};

export type AuditExportFormat = "csv" | "json";

export type AuditExportParams = AuditExportFilters & {
  format: AuditExportFormat;
  /** Required when export is queued (>10k rows). */
  email?: string;
};

/** Serializable BullMQ payload for async audit export jobs. */
export type AuditExportJobParams = {
  format: AuditExportFormat;
  q?: string;
  from?: string;
  to?: string;
  actor_id?: string;
  action?: string;
  resource_type?: string;
  resource_id?: string;
};

export type AuditExportSyncResult = {
  mode: "sync";
  format: AuditExportFormat;
  total: number;
  content: string;
};

export type AuditExportAsyncResult = {
  mode: "async";
  jobId: string;
  status: "processing";
  total: number;
};

export type AuditExportResult = AuditExportSyncResult | AuditExportAsyncResult;
