import type { Container } from "inversify";
import { Router } from "express";

import { DepartmentController } from "./department.controller.js";

/**
 * @openapi
 * tags:
 *   - name: Departments
 *     description: |
 *       Teams within an account. Requires **X-User-Role** at least **account_admin** (org_admin allowed).
 *       Scope with org_id + account_id (query and/or x-org-id, x-account-id).
 *
 * /departments:
 *   post:
 *     tags: [Departments]
 *     summary: Create department
 *     security:
 *       - hierarchyRole: []
 *     parameters:
 *       - in: query
 *         name: org_id
 *         schema: { type: string }
 *       - in: query
 *         name: account_id
 *         schema: { type: string }
 *       - in: header
 *         name: x-org-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-account-id
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
 *             required: [name, manager_id]
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               manager_id: { type: string }
 *               status: { type: string, enum: [active, inactive] }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Bad request }
 *       401: { description: Missing role or actor }
 *       403: { description: Forbidden }
 *       404: { description: Account not under org }
 *       409: { description: Duplicate name }
 *   get:
 *     tags: [Departments]
 *     summary: List departments
 *     security:
 *       - hierarchyRole: []
 *     parameters:
 *       - in: query
 *         name: org_id
 *         schema: { type: string }
 *       - in: query
 *         name: account_id
 *         schema: { type: string }
 *       - in: header
 *         name: x-org-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-account-id
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Missing scope }
 *       403: { description: Forbidden }
 *
 * /departments/{id}:
 *   get:
 *     tags: [Departments]
 *     summary: Get department by id
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
 *       - in: query
 *         name: account_id
 *         schema: { type: string }
 *       - in: header
 *         name: x-org-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-account-id
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not found }
 *   patch:
 *     tags: [Departments]
 *     summary: Update department
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
 *       - in: query
 *         name: account_id
 *         schema: { type: string }
 *       - in: header
 *         name: x-org-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-account-id
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
 *   delete:
 *     tags: [Departments]
 *     summary: Soft-delete department
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
 *       - in: query
 *         name: account_id
 *         schema: { type: string }
 *       - in: header
 *         name: x-org-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-account-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-user-id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: No content }
 *       404: { description: Not found }
 */
export function createDepartmentsRouter(container: Container): Router {
  const controller = container.get(DepartmentController);
  const router = Router();
  router.post("/", (req, res) => controller.create(req, res));
  router.get("/", (req, res) => controller.list(req, res));
  router.get("/:id", (req, res) => controller.getById(req, res));
  router.patch("/:id", (req, res) => controller.update(req, res));
  router.delete("/:id", (req, res) => controller.remove(req, res));
  return router;
}
