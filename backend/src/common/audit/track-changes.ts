import type { AuditChanges } from "@modules/audit/audit.model.js";

import { sanitizeAuditSnapshot } from "./audit-sanitize.js";

export type FieldChange = { from: unknown; to: unknown };

export type FieldChangeMap = Record<string, FieldChange>;

/** Mongo / audit metadata keys excluded from field-level diffs. */
export const CHANGE_TRACK_SKIP_FIELDS = new Set([
  "_id",
  "__v",
  "updated_at",
  "updated_by",
  "created_at",
  "created_by",
]);

function isObjectIdLike(value: unknown): boolean {
  return (
    value != null &&
    typeof value === "object" &&
    "_bsontype" in (value as object) &&
    (value as { _bsontype?: string })._bsontype === "ObjectID"
  );
}

function normalizeCompareValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (isObjectIdLike(value)) {
    return String(value);
  }
  return value;
}

/** Deep equality for audit diffing (no external deps). */
export function deepEqual(a: unknown, b: unknown): boolean {
  const left = normalizeCompareValue(a);
  const right = normalizeCompareValue(b);

  if (left === right) {
    return true;
  }
  if (left == null || right == null) {
    return left === right;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) {
      return false;
    }
    return left.every((item, index) => deepEqual(item, right[index]));
  }
  if (typeof left === "object" && typeof right === "object") {
    const leftObj = left as Record<string, unknown>;
    const rightObj = right as Record<string, unknown>;
    const keys = new Set([...Object.keys(leftObj), ...Object.keys(rightObj)]);
    for (const key of keys) {
      if (!deepEqual(leftObj[key], rightObj[key])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

/**
 * Field-level diff between two document snapshots.
 * Returns `{ field: { from, to } }` for each changed top-level key.
 */
export function trackChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): FieldChangeMap {
  const changes: FieldChangeMap = {};
  const allKeys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);

  for (const key of allKeys) {
    if (CHANGE_TRACK_SKIP_FIELDS.has(key)) {
      continue;
    }
    const fromVal = before?.[key];
    const toVal = after?.[key];
    if (!deepEqual(fromVal, toVal)) {
      changes[key] = { from: fromVal, to: toVal };
    }
  }

  return changes;
}

/** Sanitized before/after snapshots plus optional field-level `diff`. */
export function buildAuditChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): AuditChanges | undefined {
  const beforeSanitized = before != null ? sanitizeAuditSnapshot(before) : undefined;
  const afterSanitized = after != null ? sanitizeAuditSnapshot(after) : undefined;

  if (beforeSanitized === undefined && afterSanitized === undefined) {
    return undefined;
  }

  const result: AuditChanges = {};
  if (beforeSanitized !== undefined) {
    result.before = beforeSanitized;
  }
  if (afterSanitized !== undefined) {
    result.after = afterSanitized;
  }

  if (beforeSanitized !== undefined && afterSanitized !== undefined) {
    const diff = trackChanges(beforeSanitized, afterSanitized);
    if (Object.keys(diff).length > 0) {
      result.diff = diff;
    }
  }

  return result;
}
