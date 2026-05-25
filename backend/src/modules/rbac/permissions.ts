import {
  buildPermission,
  buildPermissionCatalog,
  isValidPermissionTriple,
  normalizePermission,
  parsePermission,
} from "./permission.js";
import { SYSTEM_ROLE_DEFINITIONS } from "./system-roles.js";

export { buildPermissionCatalog, buildPermissionMatrixCells } from "./permission.js";
export type { PermissionMatrixCell } from "./permission.js";

/** Assignable permission catalog (`resource:action:scope`). */
export const PERMISSION_CATALOG: readonly string[] = buildPermissionCatalog();

const CATALOG_SET = new Set<string>(PERMISSION_CATALOG);

export class InvalidPermissionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPermissionsError";
  }
}

function catalogAllows(normalized: string): boolean {
  if (CATALOG_SET.has(normalized)) {
    return true;
  }
  const parsed = parsePermission(normalized);
  if (!parsed) {
    return false;
  }
  if (parsed.action === "*" || parsed.scope === "*") {
    return CATALOG_SET.has(
      buildPermission(parsed.resource, "*", parsed.scope === "*" ? "organization" : parsed.scope),
    );
  }
  return false;
}

/**
 * Validates role permission strings (`resource:action:scope`).
 * Accepts legacy two-part / shorthand formats via `normalizePermission`.
 */
export function validateRolePermissions(permissions: string[]): string[] {
  if (!Array.isArray(permissions) || permissions.length === 0) {
    throw new InvalidPermissionsError("At least one permission is required");
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const raw of permissions) {
    const permission = normalizePermission(raw);
    if (!permission) {
      throw new InvalidPermissionsError("Permission strings cannot be empty");
    }

    const parsed = parsePermission(permission);
    if (!parsed) {
      throw new InvalidPermissionsError(`Invalid permission format: ${raw}`);
    }

    if (
      !isValidPermissionTriple(parsed.resource, parsed.action, parsed.scope)
    ) {
      throw new InvalidPermissionsError(`Invalid permission components: ${raw}`);
    }

    if (permission === "*:*:*") {
      return ["*:*:*"];
    }

    if (!catalogAllows(permission)) {
      throw new InvalidPermissionsError(`Permission not in catalog: ${permission}`);
    }

    if (seen.has(permission)) {
      continue;
    }
    seen.add(permission);
    normalized.push(permission);
  }

  return normalized;
}

/** Permissions implied by all system roles (for API catalog). */
export function getSystemRolePermissionsUnion(): string[] {
  const set = new Set<string>();
  for (const role of SYSTEM_ROLE_DEFINITIONS) {
    for (const p of role.permissions) {
      set.add(normalizePermission(p));
    }
  }
  return [...set].sort();
}
