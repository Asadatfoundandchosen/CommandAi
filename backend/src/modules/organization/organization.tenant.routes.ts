import type { Container } from "inversify";
import { Router } from "express";

import { OrganizationController } from "./organization.controller.js";

/**
 * @openapi
 * tags:
 *   - name: Tenant hierarchy
 *     description: |
 *       Tenant-scoped organization tree for admins (JWT `org_id` + **X-User-Role: org_admin**).
 *
 * /v1/organization/hierarchy:
 *   get:
 *     tags: [Tenant hierarchy]
 *     summary: Organization hierarchy dashboard (tree + counts)
 *     description: |
 *       Nested **Organization → Accounts → Departments** with **user counts per department**,
 *       plus rollup counts on each account and on the organization.
 *     security:
 *       - bearerAuth: []
 *       - hierarchyRole: []
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *       401: { description: Missing JWT tenant or role }
 *       403: { description: Insufficient role }
 *       404: { description: Organization not found }
 */
export function createOrganizationTenantRouter(container: Container): Router {
  const controller = container.get(OrganizationController);
  const router = Router();
  router.get("/hierarchy", (req, res) => controller.hierarchyForTenant(req, res));
  return router;
}
