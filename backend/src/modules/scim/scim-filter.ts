/** Parse a subset of SCIM 2.0 filter expressions for Users/Groups. */
export type ScimFilter = {
  field: string;
  operator: "eq" | "co";
  value: string;
};

const FILTER_RE =
  /^(\w+(?:\.\w+)?)\s+(eq|co)\s+"((?:\\.|[^"\\])*)"$/i;

export function parseScimFilter(raw?: string): ScimFilter | null {
  if (!raw?.trim()) {
    return null;
  }
  const match = raw.trim().match(FILTER_RE);
  if (!match) {
    return null;
  }
  const value = match[3].replace(/\\"/g, '"');
  return {
    field: match[1].toLowerCase(),
    operator: match[2].toLowerCase() as ScimFilter["operator"],
    value,
  };
}

export function buildUserMongoFilter(
  orgId: string,
  filter: ScimFilter | null,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    org_id: orgId,
    is_deleted: false,
  };

  if (!filter) {
    return base;
  }

  const normalized = filter.value.trim().toLowerCase();

  if (filter.field === "username" && filter.operator === "eq") {
    return { ...base, email: normalized };
  }

  if (filter.field === "externalid" && filter.operator === "eq") {
    return { ...base, scim_external_id: filter.value.trim() };
  }

  if (filter.field === "emails.value" && filter.operator === "eq") {
    return { ...base, email: normalized };
  }

  if (filter.field === "active" && filter.operator === "eq") {
    const active = normalized === "true";
    return { ...base, status: active ? "active" : "inactive" };
  }

  return base;
}

export function buildGroupMongoFilter(
  orgId: string,
  filter: ScimFilter | null,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    org_id: orgId,
    is_deleted: false,
  };

  if (!filter) {
    return base;
  }

  if (filter.field === "displayname" && filter.operator === "eq") {
    return { ...base, display_name: new RegExp(`^${escapeRegex(filter.value)}$`, "i") };
  }

  if (filter.field === "externalid" && filter.operator === "eq") {
    return { ...base, external_id: filter.value.trim() };
  }

  return base;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
