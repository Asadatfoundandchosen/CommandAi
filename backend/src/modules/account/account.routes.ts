import type { Container } from "inversify";
import { Router } from "express";

import { AccountController } from "./account.controller.js";

/**
 * @openapi
 * tags:
 *   - name: Accounts
 *     description: |
 *       Business units within an organization. Requires header **X-User-Role: org_admin** (or production JWT equivalent).
 *       Scope org via `org_id` query or `x-org-id` header.
 *
 * /accounts:
 *   post:
 *     tags: [Accounts]
 *     summary: Create account
 *     security:
 *       - hierarchyRole: []
 *     parameters:
 *       - in: query
 *         name: org_id
 *         schema: { type: string }
 *         description: Organization id (or use x-org-id header)
 *       - in: header
 *         name: x-org-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-user-id
 *         required: true
 *         schema: { type: string }
 *         description: Actor ObjectId for audit fields
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string }
 *               status: { type: string, enum: [active, inactive] }
 *               budget:
 *                 type: object
 *                 properties:
 *                   credit_limit: { type: number }
 *                   allocated_credits: { type: number }
 *                   used_credits: { type: number }
 *               settings: { type: object, additionalProperties: true }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Bad request }
 *       401: { description: Missing role or actor }
 *       403: { description: Forbidden }
 *       404: { description: Organization not found }
 *       409: { description: Duplicate name in org }
 *   get:
 *     tags: [Accounts]
 *     summary: List accounts for organization
 *     security:
 *       - hierarchyRole: []
 *     parameters:
 *       - in: query
 *         name: org_id
 *         schema: { type: string }
 *       - in: header
 *         name: x-org-id
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Missing org scope }
 *       401: { description: Missing role }
 *       403: { description: Forbidden }
 *
 * /accounts/{id}:
 *   get:
 *     tags: [Accounts]
 *     summary: Get account by id
 *     security:
 *       - hierarchyRole: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: org_id
 *         schema: { type: string }
 *       - in: header
 *         name: x-org-id
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not found }
 *   patch:
 *     tags: [Accounts]
 *     summary: Update account
 *     security:
 *       - hierarchyRole: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: org_id
 *         schema: { type: string }
 *       - in: header
 *         name: x-org-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-user-id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema: { type: object }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not found }
 *       409: { description: Conflict }
 *   delete:
 *     tags: [Accounts]
 *     summary: Soft-delete account
 *     security:
 *       - hierarchyRole: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: org_id
 *         schema: { type: string }
 *       - in: header
 *         name: x-org-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-user-id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: No content }
 *       404: { description: Not found }
 */
export function createAccountsRouter(container: Container): Router {
  const controller = container.get(AccountController);
  const router = Router();
  router.post("/", (req, res) => controller.create(req, res));
  router.get("/", (req, res) => controller.list(req, res));
  router.get("/:id", (req, res) => controller.getById(req, res));
  router.patch("/:id", (req, res) => controller.update(req, res));
  router.delete("/:id", (req, res) => controller.remove(req, res));
  return router;
}
