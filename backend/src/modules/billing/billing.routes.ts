import type { Container } from "inversify";
import { Router } from "express";

import { requirePlatformAdmin } from "@common/middleware/hierarchy-auth.middleware.js";
import {
  validateZodBody,
  validateZodParams,
} from "@common/middleware/validation.middleware.js";

import { BillingController } from "./billing.controller.js";
import {
  createStripeCustomerBodySchema,
  createStripeSubscriptionBodySchema,
  organizationIdParamSchema,
} from "./billing.validation.js";

/**
 * @openapi
 * tags:
 *   - name: Billing
 *     description: |
 *       **Stripe** billing (platform admin). Sync catalog, create customers/subscriptions.
 *       Webhook at `POST /api/billing/stripe/webhook` (mounted with raw body parser).
 *
 * /billing/stripe/catalog/sync:
 *   post:
 *     tags: [Billing]
 *     summary: Sync Stripe products and prices for all plans
 *     security:
 *       - platformAdminBearer: []
 *     responses:
 *       200: { description: Product and price IDs }
 *       503: { description: Stripe not configured }
 *
 * /billing/stripe/organizations/{id}/customer:
 *   post:
 *     tags: [Billing]
 *     summary: Create Stripe customer for organization
 *     security:
 *       - platformAdminBearer: []
 *
 * /billing/stripe/organizations/{id}/subscription:
 *   post:
 *     tags: [Billing]
 *     summary: Subscribe organization to a catalog plan
 *     security:
 *       - platformAdminBearer: []
 */
export function createBillingPlatformRouter(container: Container): Router {
  const controller = container.get(BillingController);
  const router = Router();
  router.use(requirePlatformAdmin());

  router.post("/catalog/sync", (req, res) => controller.syncCatalog(req, res));
  router.post(
    "/organizations/:id/customer",
    validateZodParams(organizationIdParamSchema),
    validateZodBody(createStripeCustomerBodySchema),
    (req, res) => controller.createCustomer(req, res),
  );
  router.post(
    "/organizations/:id/subscription",
    validateZodParams(organizationIdParamSchema),
    validateZodBody(createStripeSubscriptionBodySchema),
    (req, res) => controller.createSubscription(req, res),
  );

  return router;
}

export function createStripeWebhookRouter(container: Container): Router {
  const controller = container.get(BillingController);
  const router = Router();
  router.post("/", (req, res) => controller.handleWebhook(req, res));
  return router;
}
