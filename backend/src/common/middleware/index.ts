/** Shared Express middleware — export from here as features grow. */
export { requireQueueAdminAuth } from "./require-queue-admin.middleware.js";
export {
  requireMinimumHierarchyRole,
  requirePlatformAdmin,
} from "./hierarchy-auth.middleware.js";
export {
  authenticateJwt,
  createAuthenticateJwt,
} from "./jwt-auth.middleware.js";
export {
  tenantMiddleware,
  rejectCrossTenantOrgHint,
} from "./tenant.middleware.js";
export { createSessionMiddleware } from "./session.middleware.js";
export { createCsrfMiddleware, CSRF_EXEMPT_PATHS } from "./csrf.middleware.js";
export { createRateLimitMiddleware } from "./rate-limiter.middleware.js";
export { createRateLimitContextMiddleware } from "./rate-limit-context.middleware.js";
export { createRateLimitHeadersMiddleware } from "./rate-limit-headers.middleware.js";
export { createRateLimitDashboardRouter } from "./rate-limit-dashboard.routes.js";
export {
  RATE_LIMITS,
  EXPENSIVE_PATH_PREFIXES,
  isExpensiveEndpoint,
  resolveRateLimitTiers,
  getRateLimitPolicySummary,
} from "./rate-limits.config.js";
export {
  buildResponseCacheKey,
  createResponseCacheMiddleware,
  defaultResponseCacheTtlByPath,
} from "./cache.middleware.js";
export { getOrgIdForRequest } from "./tenant-resolver.js";
export {
  createMfaEnforcementMiddleware,
  MFA_ENFORCEMENT_EXEMPT_PREFIXES,
} from "./mfa-enforcement.middleware.js";
export { createProtectedApiMiddleware } from "./protected-api.middleware.js";
export {
  createLoadUserPermissionsMiddleware,
  createRequireAnyPermission,
  createRequirePermission,
} from "./permission.middleware.js";
export {
  createApiKeyAuthMiddleware,
  createOptionalApiKeyAuthMiddleware,
} from "../../modules/api-keys/api-key-auth.middleware.js";
export {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  validateZodBody,
  validateZodQuery,
  validateZodParams,
} from "./validation.middleware.js";
