import type { RequestHandler } from "express";

import { config } from "@config/index.js";

/** Bearer token must match `QUEUE_ADMIN_TOKEN` (see `config.queueMonitoring.adminToken`). */
export function requireQueueAdminAuth(): RequestHandler {
  return (req, res, next) => {
    const expected = config.queueMonitoring.adminToken;
    if (!expected) {
      res.status(503).json({ error: "Queue admin UI is not configured" });
      return;
    }
    const auth = req.headers.authorization;
    const bearer =
      typeof auth === "string" && auth.startsWith("Bearer ")
        ? auth.slice("Bearer ".length)
        : undefined;
    if (bearer !== expected) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };
}
