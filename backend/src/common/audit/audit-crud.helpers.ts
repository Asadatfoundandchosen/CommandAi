import { Types } from "mongoose";

/** Resolve tenant org from document or request context. */
export function resolveOrgId(
  doc: Record<string, unknown> | null | undefined,
  collectionName: string,
  contextOrgId?: string,
  filter?: Record<string, unknown> | null,
): Types.ObjectId | null {
  if (doc?.org_id != null) {
    return new Types.ObjectId(String(doc.org_id));
  }
  if (filter?.org_id != null) {
    return new Types.ObjectId(String(filter.org_id));
  }
  if (collectionName === "organizations" && doc?._id != null) {
    return new Types.ObjectId(String(doc._id));
  }
  if (contextOrgId != null && contextOrgId.length > 0) {
    return new Types.ObjectId(contextOrgId);
  }
  return null;
}

export function resolveResourceName(
  doc: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!doc) {
    return undefined;
  }
  for (const key of ["name", "email", "title", "slug", "key"]) {
    const val = doc[key];
    if (typeof val === "string" && val.trim().length > 0) {
      return val.trim();
    }
  }
  return undefined;
}

export function isSoftDelete(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): boolean {
  return (
    before != null &&
    after != null &&
    before.is_deleted === false &&
    after.is_deleted === true
  );
}

export function resolveCrudAction(
  collectionName: string,
  operation: "created" | "updated" | "deleted" | "read" | "bulk_updated" | "bulk_deleted" | "bulk_created",
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
): string {
  if (operation === "updated" && isSoftDelete(before, after)) {
    return `${collectionName}.deleted`;
  }
  return `${collectionName}.${operation}`;
}
