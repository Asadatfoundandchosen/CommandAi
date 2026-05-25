import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { isOpenSearchConnected } from "../../infrastructure/search/index.js";
import { TYPES } from "../../types.js";
import { AuditExportError, AuditExportService } from "./audit-export.service.js";
import { AuditService } from "./audit.service.js";
import {
  auditExportBodySchema,
  auditSearchQuerySchema,
  toAuditExportParams,
  toAuditSearchParams,
} from "./audit.validation.js";

function requireTenantOrg(req: Request, res: Response): string | undefined {
  const id = req.tenantId;
  if (!id) {
    res.status(401).json({ error: "No tenant context" });
    return undefined;
  }
  return id;
}

@injectable()
export class AuditController {
  constructor(
    @inject(TYPES.AuditService) private readonly audit: AuditService,
    @inject(TYPES.AuditExportService) private readonly auditExport: AuditExportService,
  ) {}

  /** `GET /api/v1/audit/search` — full-text audit log search with filters and aggregations. */
  search = async (req: Request, res: Response): Promise<void> => {
    if (!isOpenSearchConnected()) {
      res.status(503).json({
        error: "audit_search_unavailable",
        message: "OpenSearch is not configured",
      });
      return;
    }

    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }

    const parsed = auditSearchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const params = toAuditSearchParams(parsed.data);
      if (
        params.from !== undefined &&
        params.to !== undefined &&
        params.from.getTime() > params.to.getTime()
      ) {
        res.status(400).json({ error: "from must be before to" });
        return;
      }

      const data = await this.audit.search(orgId, params);
      res.status(200).json({ data });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Audit search failed";
      res.status(400).json({ error: message });
    }
  };

  /** `POST /api/v1/audit/export` — CSV/JSON export; async job + email when >10k rows. */
  export = async (req: Request, res: Response): Promise<void> => {
    if (!isOpenSearchConnected()) {
      res.status(503).json({
        error: "audit_export_unavailable",
        message: "OpenSearch is not configured",
      });
      return;
    }

    const orgId = requireTenantOrg(req, res);
    if (orgId === undefined) {
      return;
    }

    const parsed = auditExportBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const params = toAuditExportParams(parsed.data);
      const result = await this.auditExport.exportAuditLogs(orgId, params, {
        requestedByUserId: req.user?.sub,
      });

      if (result.mode === "async") {
        res.status(202).json({ data: result });
        return;
      }

      const stamp = new Date().toISOString().slice(0, 10);
      if (result.format === "csv") {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="audit-export-${stamp}.csv"`,
        );
        res.status(200).send(result.content);
        return;
      }

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="audit-export-${stamp}.json"`,
      );
      res.status(200).send(result.content);
    } catch (e) {
      if (e instanceof AuditExportError) {
        const status =
          e.code === "email_required" || e.code === "invalid_range" ? 400 : 503;
        res.status(status).json({ error: e.message, code: e.code });
        return;
      }
      const message = e instanceof Error ? e.message : "Audit export failed";
      res.status(400).json({ error: message });
    }
  };
}
