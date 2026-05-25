import { config } from "@config/index.js";

/** Sliding-window tiers (seconds + max requests per window). */
export type RateLimitTier = {
  window: number;
  max: number;
};

/**
 * Default policy tiers — env overrides via `config.rateLimit` when set.
 * @see `rate-limiter.middleware.ts`
 */
export const RATE_LIMITS = {
  /** Per-user (JWT `sub`, API key id, or hashed client IP). */
  default: { window: 60, max: 100 },
  /** Per-tenant (`org_id` / `req.tenantId`). */
  tenant: { window: 60, max: 1000 },
  /** Heavy endpoints (search, exports, files). */
  expensive: { window: 60, max: 10 },
} as const;

/** Path prefixes that use the **expensive** endpoint cap. */
export const EXPENSIVE_PATH_PREFIXES: readonly string[] = [
  "/api/search",
  "/api/files",
  "/api/v1/credits/transactions/export",
  "/api/v1/audit/export",
  "/api/v1/usage",
  "/api/billing/stripe/webhook",
];

export function isExpensiveEndpoint(path: string): boolean {
  const p = path.split("?")[0] ?? path;
  return EXPENSIVE_PATH_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(`${prefix}/`),
  );
}

/** Effective limits merged from env + defaults + endpoint tier. */
export function resolveRateLimitTiers(endpointPath: string): {
  tenant: RateLimitTier;
  user: RateLimitTier;
  endpoint: RateLimitTier;
} {
  const rl = config.rateLimit;
  const endpointTier = isExpensiveEndpoint(endpointPath) ? RATE_LIMITS.expensive : RATE_LIMITS.default;

  return {
    tenant: {
      window: rl.tenantWindowSec,
      max: rl.tenantMax,
    },
    user: {
      window: rl.userWindowSec,
      max: rl.userMax,
    },
    endpoint: {
      window: rl.endpointWindowSec,
      max: isExpensiveEndpoint(endpointPath) ? rl.expensiveMax : rl.endpointMax,
    },
  };
}

export function getRateLimitPolicySummary(): {
  tiers: typeof RATE_LIMITS;
  effective_default: ReturnType<typeof resolveRateLimitTiers>;
  effective_expensive: ReturnType<typeof resolveRateLimitTiers>;
  expensive_paths: readonly string[];
  enabled: boolean;
} {
  return {
    tiers: RATE_LIMITS,
    effective_default: resolveRateLimitTiers("/api/v1/roles"),
    effective_expensive: resolveRateLimitTiers("/api/search"),
    expensive_paths: EXPENSIVE_PATH_PREFIXES,
    enabled: config.rateLimit.enabled,
  };
}
