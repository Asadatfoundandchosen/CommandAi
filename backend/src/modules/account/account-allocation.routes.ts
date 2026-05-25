import type { Container } from "inversify";
import { Router } from "express";

import {
  validateZodBody,
  validateZodParams,
} from "@common/middleware/validation.middleware.js";

import { AccountController } from "./account.controller.js";
import {
  accountIdParamSchema,
  allocateCreditsBodySchema,
} from "./account.validation.js";

/**
 * @openapi
 * tags:
 *   - name: Accounts
 *     description: Credit allocation from org pool to account budget (JWT org_admin).
 *
 * /v1/accounts/{id}/allocate:
 *   post:
 *     tags: [Accounts]
 *     summary: Allocate org credits to an account
 *     description: |
 *       Deducts from the organization **credit pool** and increases the account
 *       **`budget.allocated_credits`**. Account cannot exceed **`credit_limit`** when limit &gt; 0.
 *     security:
 *       - bearerAuth: []
 *       - hierarchyRole: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: header
 *         name: x-user-id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount]
 *             properties:
 *               amount: { type: integer, minimum: 1 }
 *               description: { type: string }
 *     responses:
 *       200: { description: Allocation applied }
 *       409: { description: Insufficient org balance or account limit exceeded }
 */
export function createAccountAllocationRouter(container: Container): Router {
  const controller = container.get(AccountController);
  const router = Router();
  router.post(
    "/:id/allocate",
    validateZodParams(accountIdParamSchema),
    validateZodBody(allocateCreditsBodySchema),
    (req, res) => controller.allocate(req, res),
  );
  return router;
}
