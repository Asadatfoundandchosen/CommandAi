/**
 * RBAC permission schema: `resource:action:scope`
 * Examples: `agents:create:account`, `signals:read:own`, `*:*:*`
 */

export const RESOURCES = [
  "organizations",
  "accounts",
  "departments",
  "users",
  "agents",
  "signals",
  "approvals",
  "playbooks",
  "credits",
  "contracts",
  "audit",
] as const;

export type PermissionResource = (typeof RESOURCES)[number];

export const ACTIONS = ["create", "read", "update", "delete", "manage", "*"] as const;

export type PermissionAction = (typeof ACTIONS)[number];

export const SCOPES = ["own", "department", "account", "organization", "*"] as const;

export type PermissionScope = (typeof SCOPES)[number];

export type ParsedPermission = {
  resource: string;
  action: string;
  scope: string;
  raw: string;
};

const SCOPE_RANK: Record<string, number> = {
  own: 1,
  department: 2,
  account: 3,
  organization: 4,
  "*": 5,
};

const LEGACY_PERMISSION_MAP: Record<string, string> = {
  "*": "*:*:*",
  "org:*": "organizations:*:organization",
  "accounts:*": "accounts:*:organization",
  "users:*": "users:*:organization",
  "account:*": "accounts:*:account",
  "depts:*": "departments:*:account",
  "dept:*": "departments:*:department",
  "agents:read": "agents:read:department",
  "signals:read": "signals:read:own",
  "approvals:own": "approvals:read:own",
  "approvals:write": "approvals:update:own",
  "billing:read": "credits:read:organization",
  "webhooks:read": "audit:read:organization",
  "webhooks:write": "audit:update:organization",
  "files:read": "agents:read:organization",
  "files:write": "agents:update:organization",
  "search:read": "signals:read:organization",
  "roles:read": "users:read:organization",
  "roles:write": "users:update:organization",
};

const THREE_PART = /^([^:]+):([^:]+):([^:]+)$/;
const TWO_PART = /^([^:]+):([^:]+)$/;

/** Broader granted scope satisfies narrower required scope. */
export function scopeIncludes(grantedScope: string, requiredScope: string): boolean {
  if (grantedScope === "*" || requiredScope === "*") {
    return grantedScope === "*";
  }
  const grantedRank = SCOPE_RANK[grantedScope] ?? 0;
  const requiredRank = SCOPE_RANK[requiredScope] ?? 0;
  return grantedRank >= requiredRank;
}

export function normalizePermission(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (LEGACY_PERMISSION_MAP[trimmed]) {
    return LEGACY_PERMISSION_MAP[trimmed];
  }
  const two = trimmed.match(TWO_PART);
  if (two) {
    const [, resource, action] = two;
    if (action === "*") {
      return `${resource}:*:organization`;
    }
    return `${resource}:${action}:organization`;
  }
  return trimmed;
}

export function parsePermission(raw: string): ParsedPermission | null {
  const normalized = normalizePermission(raw);
  if (normalized === "*:*:*") {
    return { resource: "*", action: "*", scope: "*", raw: normalized };
  }
  const match = normalized.match(THREE_PART);
  if (!match) {
    return null;
  }
  return {
    resource: match[1],
    action: match[2],
    scope: match[3],
    raw: normalized,
  };
}

export function buildPermission(
  resource: string,
  action: string,
  scope: string,
): string {
  return `${resource}:${action}:${scope}`;
}

function partMatches(granted: string, required: string): boolean {
  return granted === "*" || granted === required;
}

/**
 * Returns true when any granted permission satisfies the required permission.
 * Supports wildcards on resource, action, and scope (with scope breadth).
 */
export function hasPermission(userPermissions: string[], required: string): boolean {
  const req = parsePermission(required);
  if (!req) {
    return false;
  }

  const normalizedGrants = userPermissions.map(normalizePermission);

  if (normalizedGrants.includes("*:*:*")) {
    return true;
  }

  return normalizedGrants.some((grantRaw) => {
    const grant = parsePermission(grantRaw);
    if (!grant) {
      return false;
    }
    return (
      partMatches(grant.resource, req.resource) &&
      partMatches(grant.action, req.action) &&
      (grant.scope === req.scope ||
        grant.scope === "*" ||
        req.scope === "*" ||
        scopeIncludes(grant.scope, req.scope))
    );
  });
}

/** Expand wildcard grants into explicit triples (for matrix / docs). */
export function expandPermission(grant: string): string[] {
  const parsed = parsePermission(grant);
  if (!parsed) {
    return [];
  }
  if (parsed.resource === "*" && parsed.action === "*" && parsed.scope === "*") {
    return [buildPermission("*", "*", "*")];
  }

  const resources =
    parsed.resource === "*" ? [...RESOURCES] : [parsed.resource as PermissionResource];
  const actions = parsed.action === "*" ? [...ACTIONS.filter((a) => a !== "*")] : [parsed.action];
  const scopes = parsed.scope === "*" ? [...SCOPES.filter((s) => s !== "*")] : [parsed.scope];

  const out: string[] = [];
  for (const resource of resources) {
    for (const action of actions) {
      for (const scope of scopes) {
        out.push(buildPermission(resource, action, scope));
      }
    }
  }
  return out;
}

export function expandPermissions(grants: string[]): string[] {
  const set = new Set<string>();
  for (const grant of grants) {
    for (const expanded of expandPermission(grant)) {
      set.add(expanded);
    }
    set.add(normalizePermission(grant));
  }
  return [...set].sort();
}

/**
 * Permission inheritance: merge parent role grants into child (child keeps its own).
 * Used when resolving effective permissions for a hierarchy level.
 */
export function inheritPermissions(
  childGrants: string[],
  parentGrants: string[],
): string[] {
  const set = new Set<string>();
  for (const p of parentGrants) {
    set.add(normalizePermission(p));
  }
  for (const c of childGrants) {
    set.add(normalizePermission(c));
  }
  return [...set];
}

/** Parent system role for each hierarchy level (for inheritance chain). */
export const HIERARCHY_PARENT_ROLE: Record<number, string | null> = {
  0: null,
  1: null,
  2: "org_admin",
  3: "account_admin",
  4: "dept_manager",
};

export function isValidPermissionTriple(
  resource: string,
  action: string,
  scope: string,
): boolean {
  const rOk = resource === "*" || (RESOURCES as readonly string[]).includes(resource);
  const aOk = action === "*" || (ACTIONS as readonly string[]).includes(action);
  const sOk = scope === "*" || (SCOPES as readonly string[]).includes(scope);
  return rOk && aOk && sOk;
}

/** Curated assignable permissions (resource:action:scope). */
export function buildPermissionCatalog(): string[] {
  const catalog = new Set<string>([buildPermission("*", "*", "*")]);

  const templates: Array<[PermissionResource, PermissionAction[], PermissionScope[]]> = [
    ["organizations", ["read", "update", "manage"], ["organization"]],
    ["accounts", ["create", "read", "update", "delete", "manage"], ["organization", "account"]],
    ["departments", ["create", "read", "update", "delete", "manage"], ["organization", "account", "department"]],
    ["users", ["create", "read", "update", "delete", "manage"], ["organization", "account", "department"]],
    ["agents", ["create", "read", "update", "delete"], ["organization", "account", "department"]],
    ["signals", ["create", "read", "update", "delete"], ["organization", "account", "department", "own"]],
    ["approvals", ["read", "update", "manage"], ["organization", "account", "department", "own"]],
    ["playbooks", ["create", "read", "update", "delete"], ["organization", "account"]],
    ["credits", ["read", "update", "manage"], ["organization", "account"]],
    ["contracts", ["read", "update"], ["organization"]],
    ["audit", ["read"], ["organization", "account"]],
  ];

  for (const [resource, actions, scopes] of templates) {
    for (const action of actions) {
      for (const scope of scopes) {
        catalog.add(buildPermission(resource, action, scope));
      }
    }
    catalog.add(buildPermission(resource, "*", "organization"));
    catalog.add(buildPermission(resource, "*", "account"));
  }

  return [...catalog].sort();
}

export type PermissionMatrixCell = {
  permission: string;
  resource: string;
  action: string;
  scope: string;
};

export function buildPermissionMatrixCells(): PermissionMatrixCell[] {
  return buildPermissionCatalog().map((permission) => {
    const parsed = parsePermission(permission)!;
    return {
      permission,
      resource: parsed.resource,
      action: parsed.action,
      scope: parsed.scope,
    };
  });
}
