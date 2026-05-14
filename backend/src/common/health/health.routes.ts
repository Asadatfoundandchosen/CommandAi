import { Router } from "express";

import type { HealthController } from "./health.controller.js";

/**
 * @openapi
 * /health/live:
 *   get:
 *     summary: Liveness probe
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Process is running
 * /health/ready:
 *   get:
 *     summary: Readiness probe (MongoDB + Redis)
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Dependencies healthy
 *       503:
 *         description: Degraded — one or more checks failed
 * /health/database:
 *   get:
 *     summary: MongoDB connectivity and pool configuration
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Mongo ping ok, pool min/max from config
 *       503:
 *         description: Mongo unavailable or ping failed
 */
export function createHealthRouter(controller: HealthController): Router {
  const router = Router();
  /** Backward-compatible alias — same as `/live` (legacy probes used `GET /health`). */
  router.get("/", (req, res) => {
    controller.liveness(req, res);
  });
  router.get("/live", (req, res) => {
    controller.liveness(req, res);
  });
  router.get("/ready", (req, res) => {
    void controller.readiness(req, res);
  });
  router.get("/database", (req, res) => {
    void controller.database(req, res);
  });
  return router;
}
