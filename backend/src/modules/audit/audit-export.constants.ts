/** BullMQ job name for large audit exports (> {@link AUDIT_SYNC_EXPORT_MAX_ROWS}). */
export const AUDIT_EXPORT_JOB = "audit-export";

/** Inline sync export when estimated row count is at or below this threshold. */
export const AUDIT_SYNC_EXPORT_MAX_ROWS = 10_000;

/** Page size when scrolling all matching audit events for export. */
export const AUDIT_EXPORT_PAGE_SIZE = 500;

/** Presigned download link TTL for export emails (15 minutes). */
export const AUDIT_EXPORT_DOWNLOAD_LINK_TTL = "15 minutes";
