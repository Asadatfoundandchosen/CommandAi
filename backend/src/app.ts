import type { Container } from "inversify";
import { config } from "@config/index.js";
import { createResponseCacheMiddleware } from "@common/middleware/cache.middleware.js";
import {
  createCsrfMiddleware,
  createLoadUserPermissionsMiddleware,
  createProtectedApiMiddleware,
  createRequirePermission,
  rejectCrossTenantOrgHint,
  requireMinimumHierarchyRole,
} from "@common/middleware/index.js";
import cookieParser from "cookie-parser";
import { createRateLimitContextMiddleware } from "@common/middleware/rate-limit-context.middleware.js";
import { createRateLimitDashboardRouter } from "@common/middleware/rate-limit-dashboard.routes.js";
import { createRateLimitHeadersMiddleware } from "@common/middleware/rate-limit-headers.middleware.js";
import { createHttpsSecurityMiddleware } from "@common/middleware/https-security.middleware.js";
import { createRateLimitMiddleware } from "@common/middleware/rate-limiter.middleware.js";
import { HealthController, createHealthRouter } from "@common/health/index.js";
import { createWebhooksRouter } from "@modules/webhooks/index.js";
import { createSessionsRouter } from "@modules/sessions/index.js";
import { createFilesRouter } from "@modules/files/index.js";
import { createSearchRouter } from "@modules/search/index.js";
import {
  createAccountV1Router,
  createAccountsRouter,
} from "@modules/account/index.js";
import {
  createBillingPlatformRouter,
  createStripeWebhookRouter,
  createUsageRouter,
} from "@modules/billing/index.js";
import {
  createPlansPublicRouter,
  createPlansTenantRouter,
} from "@modules/plans/index.js";
import { createContractsRouter } from "@modules/contract/index.js";
import { createDepartmentsRouter } from "@modules/department/index.js";
import {
  createOrganizationTenantRouter,
  createOrganizationsRouter,
} from "@modules/organization/index.js";
import { createAuthRouter } from "@modules/auth/index.js";
import { createScimRouter } from "@modules/scim/index.js";
import { createApiKeysRouter } from "@modules/api-keys/index.js";
import { createRolesRouter } from "@modules/rbac/index.js";
import { createCreditsRouter } from "@modules/credits/index.js";
import { createUsersRouter } from "@modules/users/index.js";
import cors from "cors";
import express, { type Express, type RequestHandler } from "express";
import helmet from "helmet";
import morgan from "morgan";
import swaggerUi from "swagger-ui-express";

import {
  createDlqRouter,
  createSchedulerRouter,
} from "./infrastructure/queue/index.js";
import { swaggerSpec } from "@config/swagger.js";

/**
 * Creates the Express application (middleware + routes).
 * Path aliases: `@modules/*`, `@common/*`, `@config/*` (see `tsconfig.json`).
 * Routers resolve controllers from the Inversify `container`.
 * Optional **session** middleware (Redis store) is registered **before** API routes
 * so sessions persist for all `/api` traffic when Redis is up.
 */
export function createApp(
  container: Container,
  options?: { sessionMiddleware?: RequestHandler },
): Express {
  const app = express();

  if (config.env === "production" || config.env === "staging") {
    app.set("trust proxy", 1);
  }

  app.disable("x-powered-by");
  app.use(
    helmet({
      hsts: {
        maxAge: config.tls.hstsMaxAgeSeconds,
        includeSubDomains: true,
        preload: config.env === "production",
      },
    }),
  );
  app.use(
    createHttpsSecurityMiddleware({
      hstsMaxAgeSeconds: config.tls.hstsMaxAgeSeconds,
      includeSubDomains: true,
      preload: config.env === "production",
      forceHttpsRedirect: config.tls.forceHttpsRedirect,
    }),
  );
  app.use(cors());
  /** Before rate limit so **429** lines appear in access logs. */
  app.use(morgan("combined"));
  /** Mount under `/api` only so `/health` probes do not create sessions in Redis. */
  if (options?.sessionMiddleware) {
    app.use("/api", options.sessionMiddleware);
  }
  /** Stripe webhooks require raw body for signature verification (before `express.json()`). */
  app.use(
    "/api/billing/stripe/webhook",
    express.raw({ type: "application/json" }),
    createStripeWebhookRouter(container),
  );
  app.use(express.json());
  /** Sliding-window limits (tenant / user / endpoint) — after JSON so JWT context can be decoded. */
  app.use("/api", createRateLimitContextMiddleware());
  if (config.rateLimit.enabled) {
    app.use("/api", createRateLimitMiddleware());
  }
  app.use("/api", createRateLimitHeadersMiddleware());
  /** SCIM 2.0 — bearer auth only; mounted outside `/api` to skip CSRF. */
  app.use("/scim/v2", createScimRouter(container));
  app.use("/api", createCsrfMiddleware());
  if (config.responseCache.enabled) {
    app.use("/api", createResponseCacheMiddleware());
  }

  app.get("/api/docs/json", (_req, res) => {
    res.status(200).json(swaggerSpec);
  });
  app.use(
    "/api/docs",
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, { customSiteTitle: "1CommandAI API" }),
  );

  const healthController = new HealthController();
  app.use("/health", createHealthRouter(healthController));

  const protectedApi = createProtectedApiMiddleware(container);
  const jwtAuth = protectedApi[0];

  app.use("/api/organizations", createOrganizationsRouter(container));
  app.use("/api/billing/stripe", createBillingPlatformRouter(container));
  app.use("/api/v1/auth", createAuthRouter(container, jwtAuth));

  app.use(
    "/api/v1/organization",
    ...protectedApi,
    rejectCrossTenantOrgHint(),
    requireMinimumHierarchyRole("org_admin"),
    createOrganizationTenantRouter(container),
  );

  app.use("/api/v1/plans", createPlansPublicRouter(container));

  app.use(
    "/api/v1/plans",
    ...protectedApi,
    rejectCrossTenantOrgHint(),
    requireMinimumHierarchyRole("org_admin"),
    createPlansTenantRouter(container),
  );

  app.use(
    "/api/v1/contracts",
    ...protectedApi,
    rejectCrossTenantOrgHint(),
    requireMinimumHierarchyRole("org_admin"),
    createContractsRouter(container),
  );

  app.use(
    "/api/v1/usage",
    ...protectedApi,
    rejectCrossTenantOrgHint(),
    requireMinimumHierarchyRole("org_admin"),
    createUsageRouter(container),
  );

  app.use(
    "/api/v1/credits",
    ...protectedApi,
    rejectCrossTenantOrgHint(),
    requireMinimumHierarchyRole("org_admin"),
    createCreditsRouter(container),
  );

  app.use(
    "/api/v1/roles",
    ...protectedApi,
    createLoadUserPermissionsMiddleware(container),
    rejectCrossTenantOrgHint(),
    requireMinimumHierarchyRole("org_admin"),
    createRolesRouter(container),
  );

  app.use(
    "/api/v1/api-keys",
    ...protectedApi,
    createLoadUserPermissionsMiddleware(container),
    rejectCrossTenantOrgHint(),
    requireMinimumHierarchyRole("org_admin"),
    createApiKeysRouter(container),
  );

  app.use(
    "/api/v1/accounts",
    ...protectedApi,
    rejectCrossTenantOrgHint(),
    requireMinimumHierarchyRole("org_admin"),
    createAccountV1Router(container),
  );

  app.use(
    "/api/accounts",
    ...protectedApi,
    rejectCrossTenantOrgHint(),
    requireMinimumHierarchyRole("org_admin"),
    createAccountsRouter(container),
  );

  app.use(
    "/api/departments",
    ...protectedApi,
    rejectCrossTenantOrgHint(),
    requireMinimumHierarchyRole("account_admin"),
    createDepartmentsRouter(container),
  );

  app.use(
    "/api/users",
    ...protectedApi,
    rejectCrossTenantOrgHint(),
    requireMinimumHierarchyRole("dept_manager"),
    createUsersRouter(container),
  );

  app.use("/api/search", createSearchRouter(container));

  app.use("/api/files", createFilesRouter(container));

  app.use("/api/webhooks", createWebhooksRouter(container));

  app.use("/api/sessions", createSessionsRouter());

  app.use("/api/dlq", createDlqRouter());

  app.use("/api/admin/rate-limits", createRateLimitDashboardRouter());

  app.use("/api/scheduler", createSchedulerRouter());

  return app;
}
