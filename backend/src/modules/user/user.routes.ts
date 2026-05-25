import type { Container } from "inversify";
import { Router } from "express";

import { validate, validateParams } from "@common/middleware/validation.middleware.js";

import { UserController } from "./user.controller.js";
import {
  createUserSchema,
  updateUserSchema,
  userIdParamJoiSchema,
} from "./user.validation.js";

/**
 * @openapi
 * tags:
 *   - name: Users
 *     description: |
 *       Team members under a department. Requires **X-User-Role** at least **dept_manager** (higher roles allowed).
 *       Scope with org_id + account_id + department_id (query and/or x-org-id, x-account-id, x-department-id).
 *
 * /users:
 *   post:
 *     tags: [Users]
 *     summary: Create user (Argon2id hash server-side; zxcvbn score >= 3; never returned)
 *     security:
 *       - hierarchyRole: []
 *     parameters:
 *       - in: query
 *         name: org_id
 *         schema: { type: string }
 *       - in: query
 *         name: account_id
 *         schema: { type: string }
 *       - in: query
 *         name: department_id
 *         schema: { type: string }
 *       - in: header
 *         name: x-org-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-account-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-department-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-user-id
 *         required: true
 *         schema: { type: string }
 *         description: Actor for audit fields
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, first_name, last_name, role]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password, minLength: 8 }
 *               first_name: { type: string }
 *               last_name: { type: string }
 *               role:
 *                 type: string
 *                 enum: [org_admin, account_admin, dept_manager, dept_user]
 *               status: { type: string, enum: [active, inactive, pending] }
 *               mfa_enabled: { type: boolean }
 *     responses:
 *       201: { description: Created (body excludes password_hash) }
 *       400:
 *         $ref: '#/components/responses/ValidationError'
 *       401: { description: Missing role or actor }
 *       403: { description: Forbidden }
 *       404: { description: Invalid hierarchy }
 *       409: { description: Duplicate email in org }
 *   get:
 *     tags: [Users]
 *     summary: List users in department
 *     security:
 *       - hierarchyRole: []
 *     parameters:
 *       - in: query
 *         name: org_id
 *         schema: { type: string }
 *       - in: query
 *         name: account_id
 *         schema: { type: string }
 *       - in: query
 *         name: department_id
 *         schema: { type: string }
 *       - in: header
 *         name: x-org-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-account-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-department-id
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Missing scope }
 *       403: { description: Forbidden }
 *
 * /users/{id}:
 *   get:
 *     tags: [Users]
 *     summary: Get user by id
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
 *       - in: query
 *         name: department_id
 *         schema: { type: string }
 *       - in: header
 *         name: x-org-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-account-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-department-id
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK (no password_hash) }
 *       404: { description: Not found }
 *   patch:
 *     tags: [Users]
 *     summary: Update user
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
 *       - in: query
 *         name: department_id
 *         schema: { type: string }
 *       - in: header
 *         name: x-org-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-account-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-department-id
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
 *       409: { description: Duplicate email }
 *   delete:
 *     tags: [Users]
 *     summary: Soft-delete user
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
 *       - in: query
 *         name: department_id
 *         schema: { type: string }
 *       - in: header
 *         name: x-org-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-account-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-department-id
 *         schema: { type: string }
 *       - in: header
 *         name: x-user-id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: No content }
 *       404: { description: Not found }
 */
export function createUsersRouter(container: Container): Router {
  const controller = container.get(UserController);
  const router = Router();
  router.post("/", validate(createUserSchema), (req, res) => controller.create(req, res));
  router.get("/", (req, res) => controller.list(req, res));
  router.get("/:id", validateParams(userIdParamJoiSchema), (req, res) =>
    controller.getById(req, res),
  );
  router.patch(
    "/:id",
    validateParams(userIdParamJoiSchema),
    validate(updateUserSchema),
    (req, res) => controller.update(req, res),
  );
  router.delete("/:id", validateParams(userIdParamJoiSchema), (req, res) =>
    controller.remove(req, res),
  );
  return router;
}
