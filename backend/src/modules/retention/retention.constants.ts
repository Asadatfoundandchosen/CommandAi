/** BullMQ / scheduler job id for daily audit retention sweep. */
export const AUDIT_RETENTION_DAILY_JOB = "audit-retention-daily-scan";

/** Regulatory minimum retention (1 year). */
export const AUDIT_RETENTION_MIN_DAYS = 365;

/** Default retention when org has no custom policy (3 years). */
export const DEFAULT_AUDIT_RETENTION_DAYS = 365 * 3;

export const DEFAULT_RETENTION_POLICY = {
  audit_retention_days: DEFAULT_AUDIT_RETENTION_DAYS,
  archive_before_delete: true,
} as const;

/** MongoDB batch size per archive/delete cycle. */
export const RETENTION_BATCH_SIZE = 500;

/** S3 prefix for archived audit logs (Glacier via storage class + lifecycle). */
export const AUDIT_ARCHIVE_S3_PREFIX = "audit-archives";
