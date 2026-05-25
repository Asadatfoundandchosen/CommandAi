import type { Container } from "inversify";
import { Router } from "express";

import { requirePlatformAdmin } from "@common/middleware/hierarchy-auth.middleware.js";
import {
  validateZodBody,
  validateZodParams,
} from "@common/middleware/validation.middleware.js";

import { setOrgCreditRatesBodySchema } from "../credits/credits.validation.js";
import { OrganizationController } from "./organization.controller.js";
import {
  createOrganizationBodySchema,
  organizationIdParamSchema,
  updateOrganizationBodySchema,
} from "./organization.validation.js";

/**
 * @openapi
 * tags:
 *   - name: Organizations
 *     description: |
 *       Tenant root (Organization). **Platform admin only** — use bearer token matching env `PLATFORM_ADMIN_TOKEN`.
 *
 * /organizations:
 *   post:
 *     tags: [Organizations]
 *     summary: Create organization
 *     security:
 *       - platformAdminBearer: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, slug]
 *             properties:
 *               name: { type: string, maxLength: 256 }
 *               slug:
 *                 type: string
 *                 pattern: '^[a-z0-9]+(-[a-z0-9]+)*$'
 *               status:
 *                 type: string
 *                 enum: [active, suspended, trial]
 *               settings:
 *                 type: object
 *                 properties:
 *                   timezone: { type: string }
 *                   locale: { type: string }
 *                   features:
 *                     type: array
 *                     items: { type: string }
 *     responses:
 *       201:
 *         description: Created
 *       401: { description: Unauthorized }
 *       409: { description: Conflict (e.g. duplicate slug) }
 *       503: { description: PLATFORM_ADMIN_TOKEN not configured }
 *   get:
 *     tags: [Organizations]
 *     summary: List organizations
 *     security:
 *       - platformAdminBearer: []
 *     responses:
 *       200:
 *         description: OK
 *       401: { description: Unauthorized }
 *       503: { description: PLATFORM_ADMIN_TOKEN not configured }
 *
 * /organizations/{id}:
 *   get:
 *     tags: [Organizations]
 *     summary: Get organization by id
 *     security:
 *       - platformAdminBearer: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 *       404: { description: Not found }
 *       503: { description: PLATFORM_ADMIN_TOKEN not configured }
 *   patch:
 *     tags: [Organizations]
 *     summary: Update organization
 *     security:
 *       - platformAdminBearer: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               slug: { type: string }
 *               status: { type: string, enum: [active, suspended, trial] }
 *               settings: { type: object }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Invalid status transition }
 *       401: { description: Unauthorized }
 *       404: { description: Not found }
 *       409: { description: Conflict }
 *       503: { description: PLATFORM_ADMIN_TOKEN not configured }
 *   delete:
 *     tags: [Organizations]
 *     summary: Delete organization
 *     security:
 *       - platformAdminBearer: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       204: { description: No content }
 *       401: { description: Unauthorized }
 *       404: { description: Not found }
 *       503: { description: PLATFORM_ADMIN_TOKEN not configured }
 */
export function createOrganizationsRouter(container: Container): Router {
  const controller = container.get(OrganizationController);
  const router = Router();
  router.use(requirePlatformAdmin());
  router.post("/", validateZodBody(createOrganizationBodySchema), (req, res) =>
    controller.create(req, res),
  );
  router.get("/", (req, res) => controller.list(req, res));
  router.get("/:id", validateZodParams(organizationIdParamSchema), (req, res) =>
    controller.getById(req, res),
  );
  router.patch(
    "/:id",
    validateZodParams(organizationIdParamSchema),
    validateZodBody(updateOrganizationBodySchema),
    (req, res) => controller.update(req, res),
  );
  router.put(
    "/:id/credit-rates",
    validateZodParams(organizationIdParamSchema),
    validateZodBody(setOrgCreditRatesBodySchema),
    (req, res) => controller.setCreditRates(req, res),
  );
  router.delete("/:id/credit-rates", validateZodParams(organizationIdParamSchema), (req, res) =>
    controller.clearCreditRates(req, res),
  );
  router.delete("/:id", validateZodParams(organizationIdParamSchema), (req, res) =>
    controller.remove(req, res),
  );
  return router;
}
