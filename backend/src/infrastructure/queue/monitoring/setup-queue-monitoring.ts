import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import type { Express } from "express";
import helmet from "helmet";

import { requireQueueAdminAuth } from "@common/middleware/index.js";
import { config } from "@config/index.js";
import { startAnalyticsReadMonitoring } from "../../database/mongo-analytics-metrics.js";
import { startMongoPoolMetrics } from "../../database/mongo-pool-metrics.js";

import { getDlqQueues } from "../dlq/setup-dlq.js";
import { queues } from "../queues/index.js";
import {
  queueMetricsRegister,
  startQueueMetricsCollector,
  stopQueueMetricsCollector,
} from "./queue-metrics.js";
import { registerRateLimitMetrics } from "./rate-limit-metrics.js";
import { registerPubSubMetrics } from "../../pubsub/pubsub-metrics.js";
import { registerResponseCacheMetrics } from "./response-cache-metrics.js";
import { registerCacheInvalidationMetrics } from "../../cache/cache-invalidation-metrics.js";
import { registerAuthMetrics } from "../../../modules/auth/auth-metrics.js";
import { registerPermissionCacheMetrics } from "../../../modules/rbac/permission-cache.metrics.js";
import { startSessionMetrics, stopSessionMetrics } from "./session-metrics.js";

export { startQueueMetricsCollector, stopQueueMetricsCollector, stopSessionMetrics };

/**
 * Mounts Prometheus scrape endpoint and optional Bull Board UI.
 * Call after **MongoDB** and Redis are up, workers started, and DLQ queues are registered
 * so the dashboard lists DLQs. Registers Mongo **pool** metrics on the same registry.
 */
export function setupQueueMonitoring(app: Express): void {
  registerRateLimitMetrics(queueMetricsRegister);
  registerResponseCacheMetrics(queueMetricsRegister);
  registerCacheInvalidationMetrics(queueMetricsRegister);
  registerPubSubMetrics(queueMetricsRegister);
  registerAuthMetrics(queueMetricsRegister);
  registerPermissionCacheMetrics(queueMetricsRegister);
  startMongoPoolMetrics(
    queueMetricsRegister,
    config.queueMonitoring.metricsIntervalMs,
  );
  startAnalyticsReadMonitoring(
    queueMetricsRegister,
    config.queueMonitoring.metricsIntervalMs,
  );
  startSessionMetrics(
    queueMetricsRegister,
    config.queueMonitoring.metricsIntervalMs,
  );
  app.get("/metrics", async (_req, res) => {
    try {
      res.set("Content-Type", queueMetricsRegister.contentType);
      res.end(await queueMetricsRegister.metrics());
    } catch (e) {
      res.status(500).end(String(e));
    }
  });

  const token = config.queueMonitoring.adminToken;
  if (!token) {
    process.stdout.write(
      "QUEUE_ADMIN_TOKEN not set; Bull Board UI disabled (set token to enable /admin/queues).\n",
    );
    return;
  }

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath("/admin/queues");

  const main = Object.values(queues).map((q) => new BullMQAdapter(q));
  const dlqAdapters = getDlqQueues().map((q) => new BullMQAdapter(q));

  createBullBoard({
    queues: [...main, ...dlqAdapters],
    serverAdapter,
  });

  app.use(
    "/admin/queues",
    helmet({ contentSecurityPolicy: false }),
    requireQueueAdminAuth(),
    serverAdapter.getRouter(),
  );
}
