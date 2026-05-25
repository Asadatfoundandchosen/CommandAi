import type { Container } from "inversify";
import { Router } from "express";

import { UsageController } from "./usage.controller.js";

/**
 * @openapi
 * tags:
 *   - name: Usage
 *     description: Org credit consumption dashboard (JWT org scope).
 *
 * /v1/usage/summary:
 *   get:
 *     tags: [Usage]
 *     summary: Credit usage summary for organization
 *     description: |
 *       Shows **credits used vs allocated**, breakdown **by account**, and **usage trends**
 *       (Timescale `credit_usage` when connected; otherwise org billing ledger).
 *     security:
 *       - bearerAuth: []
 *       - hierarchyRole: []
 *     responses:
 *       200:
 *         description: Usage summary
 *       401: { description: Unauthorized }
 *       404: { description: Organization not found }
 */
export function createUsageRouter(container: Container): Router {
  const controller = container.get(UsageController);
  const router = Router();
  router.get("/summary", (req, res) => controller.summary(req, res));
  return router;
}
