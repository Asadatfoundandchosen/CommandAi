import {
  AUDIT_ARCHIVE_S3_PREFIX,
  AUDIT_RETENTION_MIN_DAYS,
  DEFAULT_RETENTION_POLICY,
} from "./retention.constants.js";

export function subDays(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

export function defaultArchiveLocation(orgId: string): string {
  return `${AUDIT_ARCHIVE_S3_PREFIX}/${orgId}/`;
}

export function normalizeArchiveLocation(orgId: string, location?: string): string {
  const trimmed = location?.trim();
  if (trimmed === undefined || trimmed.length === 0) {
    return defaultArchiveLocation(orgId);
  }
  const withSlash = trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  const expectedPrefix = `${AUDIT_ARCHIVE_S3_PREFIX}/${orgId}`;
  if (!withSlash.startsWith(expectedPrefix)) {
    throw new Error(
      `archive_location must start with ${expectedPrefix}/`,
    );
  }
  if (withSlash.includes("..")) {
    throw new Error("archive_location must not contain ..");
  }
  return withSlash;
}

export function validateRetentionDays(
  days: number,
  maxDays: number,
): void {
  if (!Number.isInteger(days)) {
    throw new Error("audit_retention_days must be an integer");
  }
  if (days < AUDIT_RETENTION_MIN_DAYS) {
    throw new Error(
      `audit_retention_days must be at least ${AUDIT_RETENTION_MIN_DAYS} (1 year)`,
    );
  }
  if (days > maxDays) {
    throw new Error(`audit_retention_days must not exceed ${maxDays}`);
  }
}

export function resolveEffectivePolicy(
  orgId: string,
  stored: {
    audit_retention_days: number;
    archive_before_delete: boolean;
    archive_location: string;
  } | null,
): {
  audit_retention_days: number;
  archive_before_delete: boolean;
  archive_location: string;
  is_default: boolean;
} {
  if (stored === null) {
    return {
      audit_retention_days: DEFAULT_RETENTION_POLICY.audit_retention_days,
      archive_before_delete: DEFAULT_RETENTION_POLICY.archive_before_delete,
      archive_location: defaultArchiveLocation(orgId),
      is_default: true,
    };
  }
  return {
    audit_retention_days: stored.audit_retention_days,
    archive_before_delete: stored.archive_before_delete,
    archive_location: stored.archive_location,
    is_default: false,
  };
}

export function computeRetentionCutoff(now: Date, retentionDays: number): Date {
  return subDays(now, retentionDays);
}
