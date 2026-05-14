import type { Container } from "inversify";
import { Router } from "express";

import { SearchController } from "./search.controller.js";

/**
 * @openapi
 * /search:
 *   get:
 *     summary: Full-text search (agents, signals, users) within a tenant
 *     tags: [Search]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query
 *       - in: query
 *         name: org_id
 *         schema:
 *           type: string
 *         description: Tenant org (prefer x-org-id or JWT; required if not in token)
 *       - in: header
 *         name: x-org-id
 *         schema:
 *           type: string
 *         description: Tenant org id
 *       - in: query
 *         name: entity_type
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *             enum: [agent, signal, user]
 *         description: Filter to entity types (repeat or comma-separated)
 *     responses:
 *       200:
 *         description: Hits with highlights, scoped to org
 *       400:
 *         description: Missing org or invalid query
 *       503:
 *         description: OpenSearch not configured
 */
export function createSearchRouter(container: Container): Router {
  const controller = container.get<SearchController>(SearchController);
  const router = Router();
  router.get("/", (req, res) => controller.get(req, res));
  return router;
}
