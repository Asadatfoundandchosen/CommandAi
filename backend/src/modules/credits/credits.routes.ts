import type { Container } from "inversify";
import { Router } from "express";

import {
  validateZodBody,
  validateZodQuery,
} from "@common/middleware/validation.middleware.js";

import { CreditsController } from "./credits.controller.js";
import {
  creditTransactionsQuerySchema,
  purchaseCreditsBodySchema,
  updateCreditAlertSettingsBodySchema,
} from "./credits.validation.js";

/**
 * @openapi
 * tags:
 *   - name: Credits
 *     description: Org credit balance and Stripe credit pack purchases (JWT org scope).
 *
 * /v1/credits/balance:
 *   get:
 *     tags: [Credits]
 *     summary: Get organization credit balance
 *     security:
 *       - bearerAuth: []
 *       - hierarchyRole: []
 *     responses:
 *       200: { description: Credit balance }
 *
 * /v1/credits/rates:
 *   get:
 *     tags: [Credits]
 *     summary: Credit consumption rate card for organization
 *     description: |
 *       Returns platform **default rates** or **enterprise custom** overrides
 *       (`org_settings` key `credit_rates`).
 *     security:
 *       - bearerAuth: []
 *       - hierarchyRole: []
 *     responses:
 *       200: { description: Rate card with labels }
 *
 * /v1/credits/purchase:
 *   post:
 *     tags: [Credits]
 *     summary: Start Stripe credit pack purchase
 *     description: |
 *       Creates a **PaymentIntent** ($0.01/credit). Credits are added to the org balance
 *       on **`payment_intent.succeeded`** webhook immediately after payment.
 *     security:
 *       - bearerAuth: []
 *       - hierarchyRole: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount:
 *                 type: integer
 *                 minimum: 100
 *                 description: Number of credits to purchase
 *     responses:
 *       200:
 *         description: PaymentIntent client secret for Stripe Elements
 *       400: { description: Validation or billing error }
 *       503: { description: Stripe not configured }
 */
export function createCreditsRouter(container: Container): Router {
  const controller = container.get(CreditsController);
  const router = Router();
  router.get(
    "/transactions/export",
    validateZodQuery(creditTransactionsQuerySchema),
    (req, res) => controller.transactionsExport(req, res),
  );
  router.get(
    "/transactions/summary",
    validateZodQuery(creditTransactionsQuerySchema),
    (req, res) => controller.transactionsSummary(req, res),
  );
  router.get(
    "/transactions",
    validateZodQuery(creditTransactionsQuerySchema),
    (req, res) => controller.transactions(req, res),
  );
  router.get("/balance", (req, res) => controller.balance(req, res));
  router.get("/rates", (req, res) => controller.rates(req, res));
  router.get("/alerts/settings", (req, res) => controller.getAlertSettings(req, res));
  router.put(
    "/alerts/settings",
    validateZodBody(updateCreditAlertSettingsBodySchema),
    (req, res) => controller.updateAlertSettings(req, res),
  );
  router.post("/purchase", validateZodBody(purchaseCreditsBodySchema), (req, res) =>
    controller.purchase(req, res),
  );
  return router;
}
