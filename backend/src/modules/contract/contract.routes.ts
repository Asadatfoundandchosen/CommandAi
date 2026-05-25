import type { Container } from "inversify";
import { Router } from "express";

import { ContractController } from "./contract.controller.js";

/**
 * @openapi
 * tags:
 *   - name: Contracts
 *     description: |
 *       Read-only contract terms for tenant org admins (JWT `org_id` + **X-User-Role: org_admin**).
 *
 * /v1/contracts/current:
 *   get:
 *     tags: [Contracts]
 *     summary: Current active contract terms
 *     description: |
 *       Returns the **active** agreement for the JWT organization: dates, credits, renewal terms,
 *       days until renewal/expiry, and in-app expiry notifications. Platform-only fields (e.g.
 *       `internal_notes`) are never exposed.
 *     security:
 *       - bearerAuth: []
 *       - hierarchyRole: []
 *     responses:
 *       200:
 *         description: Active contract found
 *       401: { description: Missing JWT tenant or role }
 *       403: { description: Insufficient role }
 *       404: { description: No active contract for this organization }
 */
export function createContractsRouter(container: Container): Router {
  const controller = container.get(ContractController);
  const router = Router();
  router.get("/current", (req, res) => controller.getCurrent(req, res));
  return router;
}
