import type { Container } from "inversify";
import { Router } from "express";

import { createRequirePermission } from "@common/middleware/permission.middleware.js";
import { validateZodBody, validateZodQuery } from "@common/middleware/validation.middleware.js";

import { AuditController } from "./audit.controller.js";
import { auditExportBodySchema, auditSearchQuerySchema } from "./audit.validation.js";

/**
 * @openapi
 * tags:
 *   - name: Audit
 *     description: Tenant audit log search (OpenSearch `audit-*`, append-only).
 *
 * /v1/audit/search:
 *   get:
 *     tags: [Audit]
 *     summary: Search audit events
 *     description: |
 *       Full-text search over **`audit-*`** with filters for time range, actor, action,
 *       and resource. Returns paginated hits plus aggregations for dashboard charts.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Full-text query (action, resource, request_id, IP, etc.)
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: actor_id
 *         schema: { type: string }
 *       - in: query
 *         name: action
 *         schema: { type: string }
 *         description: Wildcard filter on action (substring match)
 *       - in: query
 *         name: resource_type
 *         schema: { type: string }
 *       - in: query
 *         name: resource_id
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 100, maximum: 500 }
 *       - in: query
 *         name: include_aggs
 *         schema: { type: boolean, default: true }
 *     responses:
 *       200:
 *         description: Paginated audit hits and optional aggregations
 *       400:
 *         description: Validation error
 *       401:
 *         description: Missing tenant context
 *       403:
 *         description: Missing audit:read:organization permission
 *       503:
 *         description: OpenSearch not configured
 *
 * /v1/audit/export:
 *   post:
 *     tags: [Audit]
 *     summary: Export audit events (CSV or JSON)
 *     description: |
 *       Apply the same filters as search. Exports **≤10,000** rows inline; larger exports
 *       run as a background job, upload to S3, and email a **presigned download URL** (15m TTL).
 *       **`email`** is required when the filtered result set exceeds 10,000 rows.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               format: { type: string, enum: [csv, json], default: csv }
 *               email: { type: string, format: email }
 *               q: { type: string }
 *               from: { type: string, format: date-time }
 *               to: { type: string, format: date-time }
 *               actor_id: { type: string }
 *               action: { type: string }
 *               resource_type: { type: string }
 *               resource_id: { type: string }
 *     responses:
 *       200:
 *         description: Inline CSV or JSON file (≤10k rows)
 *       202:
 *         description: Async export queued (>10k rows)
 *       400:
 *         description: Validation error or missing email for large export
 *       401:
 *         description: Missing tenant context
 *       403:
 *         description: Missing audit:read:organization permission
 *       503:
 *         description: OpenSearch or S3 not configured
 */
export function createAuditRouter(container: Container): Router {
  const controller = container.get(AuditController);
  const router = Router();

  router.get(
    "/search",
    createRequirePermission("audit:read:organization"),
    validateZodQuery(auditSearchQuerySchema),
    (req, res) => controller.search(req, res),
  );

  router.post(
    "/export",
    createRequirePermission("audit:read:organization"),
    validateZodBody(auditExportBodySchema),
    (req, res) => controller.export(req, res),
  );

  return router;
}
