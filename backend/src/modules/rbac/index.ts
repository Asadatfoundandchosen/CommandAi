export { createRolesRouter } from "./role.routes.js";
export { RoleService } from "./role.service.js";
export { PermissionResolverService } from "./permission-resolver.service.js";
export {
  PermissionCacheService,
  PERMISSION_CACHE_TTL_SEC,
  permissionCacheKey,
} from "./permission-cache.service.js";
export {
  ROLE_HIERARCHY,
  ROLE_HIERARCHY_CHAIN,
  ROLE_HIERARCHY_LABEL,
  getEffectiveRoleNames,
} from "./role-hierarchy.js";
export {
  ACTIONS,
  RESOURCES,
  SCOPES,
  hasPermission,
  normalizePermission,
  parsePermission,
  scopeIncludes,
  buildPermission,
  expandPermissions,
  inheritPermissions,
} from "./permission.js";
export { PERMISSION_CATALOG, validateRolePermissions } from "./permissions.js";
export { SYSTEM_ROLE_DEFINITIONS, SYSTEM_ROLE_NAMES } from "./system-roles.js";
export type { IRole } from "./role.model.js";
