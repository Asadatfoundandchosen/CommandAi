import type { Container } from "inversify";
import { config } from "@config/index.js";
import { createResponseCacheMiddleware } from "@common/middleware/cache.middleware.js";
import {
  authenticateJwt,
  rejectCrossTenantOrgHint,
  requireMinimumHierarchyRole,
  tenantMiddleware,
} from "@common/middleware/index.js";
import { createRateLimitMiddleware } from "@common/middleware/rate-limiter.middleware.js";
import { HealthController, createHealthRouter } from "@common/health/index.js";
import { createWebhooksRouter } from "@modules/webhooks/index.js";
import { createSessionsRouter } from "@modules/sessions/index.js";
import { createFilesRouter } from "@modules/files/index.js";
import { createSearchRouter } from "@modules/search/index.js";
import { createAccountsRouter } from "@modules/account/index.js";
import { createDepartmentsRouter } from "@modules/department/index.js";
import {
  createOrganizationTenantRouter,
  createOrganizationsRouter,
} from "@modules/organization/index.js";
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
  app.use(helmet());
  app.use(cors());
  /** Before rate limit so **429** lines appear in access logs. */
  app.use(morgan("combined"));
  if (config.rateLimit.enabled) {
    app.use("/api", createRateLimitMiddleware());
  }
  /** Mount under `/api` only so `/health` probes do not create sessions in Redis. */
  if (options?.sessionMiddleware) {
    app.use("/api", options.sessionMiddleware);
  }
  app.use(express.json());
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

  app.use("/api/organizations", createOrganizationsRouter(container));

  app.use(
    "/api/v1/organization",
    authenticateJwt(),
    tenantMiddleware,
    rejectCrossTenantOrgHint(),
    requireMinimumHierarchyRole("org_admin"),
    createOrganizationTenantRouter(container),
  );

  app.use(
    "/api/accounts",
    authenticateJwt(),
    tenantMiddleware,
    rejectCrossTenantOrgHint(),
    requireMinimumHierarchyRole("org_admin"),
    createAccountsRouter(container),
  );

  app.use(
    "/api/departments",
    authenticateJwt(),
    tenantMiddleware,
    rejectCrossTenantOrgHint(),
    requireMinimumHierarchyRole("account_admin"),
    createDepartmentsRouter(container),
  );

  app.use(
    "/api/users",
    authenticateJwt(),
    tenantMiddleware,
    rejectCrossTenantOrgHint(),
    requireMinimumHierarchyRole("dept_manager"),
    createUsersRouter(container),
  );

  app.use("/api/search", createSearchRouter(container));

  app.use("/api/files", createFilesRouter(container));

  app.use("/api/webhooks", createWebhooksRouter(container));

  app.use("/api/sessions", createSessionsRouter());

  app.use("/api/dlq", createDlqRouter());

  app.use("/api/scheduler", createSchedulerRouter());

  return app;
}
