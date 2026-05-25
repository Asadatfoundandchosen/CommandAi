import type { Container } from "inversify";
import { Router } from "express";

import { createRequirePermission } from "@common/middleware/permission.middleware.js";
import {
  validateZodBody,
  validateZodParams,
} from "@common/middleware/validation.middleware.js";

import { RoleController } from "./role.controller.js";
import {
  createRoleBodySchema,
  roleIdParamsSchema,
  updateRoleBodySchema,
} from "./role.validation.js";

/**
 * @openapi
 * tags:
 *   - name: Roles
 *     description: |
 *       System and custom roles (JWT org_admin). System roles are read-only.
 *       Custom roles are scoped to the tenant organization.
 *
 * /v1/roles:
 *   get:
 *     tags: [Roles]
 *     summary: List system + org custom roles
 *     security:
 *       - bearerAuth: []
 *   post:
 *     tags: [Roles]
 *     summary: Create custom role
 *     security:
 *       - bearerAuth: []
 *
 * /v1/roles/permissions:
 *   get:
 *     tags: [Roles]
 *     summary: Permission catalog for custom roles
 *     security:
 *       - bearerAuth: []
 *
 * /v1/roles/{id}:
 *   get:
 *     tags: [Roles]
 *     summary: Get role by id
 *     security:
 *       - bearerAuth: []
 *   patch:
 *     tags: [Roles]
 *     summary: Update custom role
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     tags: [Roles]
 *     summary: Delete custom role (system roles forbidden)
 *     security:
 *       - bearerAuth: []
 */
export function createRolesRouter(container: Container): Router {
  const controller = container.get(RoleController);
  const router = Router();

  router.get("/permissions", (req, res) => controller.listPermissions(req, res));
  router.get("/hierarchy", (req, res) => controller.hierarchy(req, res));
  router.get("/permission-matrix", (req, res) => controller.permissionMatrix(req, res));
  router.get("/", (req, res) => controller.list(req, res));
  const manageRoles = createRequirePermission("users:update:organization");
  router.post(
    "/",
    manageRoles,
    validateZodBody(createRoleBodySchema),
    (req, res) => controller.create(req, res),
  );
  router.get("/:id", validateZodParams(roleIdParamsSchema), (req, res) =>
    controller.getById(req, res),
  );
  router.patch(
    "/:id",
    manageRoles,
    validateZodParams(roleIdParamsSchema),
    validateZodBody(updateRoleBodySchema),
    (req, res) => controller.update(req, res),
  );
  router.delete("/:id", manageRoles, validateZodParams(roleIdParamsSchema), (req, res) =>
    controller.remove(req, res),
  );

  return router;
}
