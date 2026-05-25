import type { Container } from "inversify";
import { Router } from "express";

import { validateZodBody } from "@common/middleware/validation.middleware.js";

import { PlanController } from "./plan.controller.js";
import { changePlanBodySchema } from "./plan.validation.js";

/**
 * @openapi
 * tags:
 *   - name: Plans
 *     description: Subscription tiers, limits, and upgrade/downgrade.
 *
 * /v1/plans:
 *   get:
 *     tags: [Plans]
 *     summary: List subscription plan catalog
 *     responses:
 *       200:
 *         description: Starter, Pro, and Enterprise tiers with limits and pricing
 *
 * /v1/plans/current:
 *   get:
 *     tags: [Plans]
 *     summary: Current org plan and usage
 *     security:
 *       - bearerAuth: []
 *       - hierarchyRole: []
 *
 * /v1/plans/change:
 *   post:
 *     tags: [Plans]
 *     summary: Upgrade or downgrade organization plan
 *     security:
 *       - bearerAuth: []
 *       - hierarchyRole: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tier, billing_cycle]
 *             properties:
 *               tier: { type: string, enum: [starter, pro, enterprise] }
 *               billing_cycle: { type: string, enum: [monthly, annual] }
 */
export function createPlansPublicRouter(container: Container): Router {
  const controller = container.get(PlanController);
  const router = Router();
  router.get("/", (req, res) => controller.list(req, res));
  return router;
}

export function createPlansTenantRouter(container: Container): Router {
  const controller = container.get(PlanController);
  const router = Router();
  router.get("/current", (req, res) => controller.getCurrent(req, res));
  router.post("/change", validateZodBody(changePlanBodySchema), (req, res) =>
    controller.change(req, res),
  );
  return router;
}
