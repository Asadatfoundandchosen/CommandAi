import type { Container } from "inversify";
import { Router } from "express";

import {
  validateZodBody,
  validateZodParams,
} from "@common/middleware/validation.middleware.js";

import { AccountBudgetController } from "./account-budget.controller.js";
import { AccountController } from "./account.controller.js";
import {
  accountIdParamSchema,
  allocateBudgetBodySchema,
  allocateCreditsBodySchema,
  patchAccountBudgetLimitBodySchema,
} from "./account.validation.js";

/**
 * @openapi
 * tags:
 *   - name: AccountBudgets
 *     description: Per-account credit budgets (JWT org_admin).
 *
 * /v1/accounts/{id}/budget:
 *   get:
 *     tags: [AccountBudgets]
 *     summary: Get account budget
 *     description: |
 *       Returns **allocated**, **available**, **used**, **limit**, and usage warning state.
 *       Usage is tracked per account; consumption cannot exceed **available** (allocated − used).
 *     security:
 *       - bearerAuth: []
 *       - hierarchyRole: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Account budget }
 *       404: { description: Account not found }
 *
 * /v1/accounts/{id}/budget/allocate:
 *   post:
 *     tags: [AccountBudgets]
 *     summary: Allocate org credits to account budget
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
 *       200: { description: Budget updated after allocation }
 *
 * /v1/accounts/{id}/budget/limit:
 *   patch:
 *     tags: [AccountBudgets]
 *     summary: Set account credit limit and/or warning threshold
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
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               limit: { type: integer, minimum: 0 }
 *               warning_threshold: { type: integer, minimum: 1, maximum: 100 }
 *     responses:
 *       200: { description: Budget limits updated }
 */
export function createAccountV1Router(container: Container): Router {
  const budgetController = container.get(AccountBudgetController);
  const accountController = container.get(AccountController);
  const router = Router();

  router.get(
    "/:id/budget",
    validateZodParams(accountIdParamSchema),
    (req, res) => budgetController.getBudget(req, res),
  );
  router.post(
    "/:id/budget/allocate",
    validateZodParams(accountIdParamSchema),
    validateZodBody(allocateBudgetBodySchema),
    (req, res) => budgetController.allocateBudget(req, res),
  );
  router.patch(
    "/:id/budget/limit",
    validateZodParams(accountIdParamSchema),
    validateZodBody(patchAccountBudgetLimitBodySchema),
    (req, res) => budgetController.patchLimit(req, res),
  );

  /** Legacy path — same as `POST …/budget/allocate`. */
  router.post(
    "/:id/allocate",
    validateZodParams(accountIdParamSchema),
    validateZodBody(allocateCreditsBodySchema),
    (req, res) => accountController.allocate(req, res),
  );

  return router;
}
