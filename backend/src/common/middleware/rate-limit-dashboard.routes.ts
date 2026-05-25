import { Router } from "express";

import { requireQueueAdminAuth } from "./require-queue-admin.middleware.js";
import { getRateLimitPolicySummary } from "./rate-limits.config.js";
import { getRateLimit429Totals } from "../../infrastructure/queue/monitoring/rate-limit-metrics.js";

/**
 * Rate limit observability for operators (Bearer `QUEUE_ADMIN_TOKEN`).
 * Grafana: dashboard uid `1cmd-rate-limits`.
 */
export function createRateLimitDashboardRouter(): Router {
  const router = Router();

  router.get("/", requireQueueAdminAuth(), async (_req, res) => {
    try {
      const policy = getRateLimitPolicySummary();
      const metrics429 = await getRateLimit429Totals();

      res.status(200).json({
        data: {
          ...policy,
          dimensions: ["tenant", "user", "endpoint"],
          algorithm: "sliding_window_redis_zset",
          headers: ["X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "Retry-After"],
          metrics_429_total: metrics429,
          grafana: {
            dashboard_uid: "1cmd-rate-limits",
            title: "1CommandAI — API rate limits",
          },
        },
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  return router;
}
