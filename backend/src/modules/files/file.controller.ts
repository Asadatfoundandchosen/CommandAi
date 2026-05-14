import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { TYPES } from "../../types.js";
import { FileServiceError } from "./file.errors.js";
import { FileService } from "./file.service.js";
import {
  presignDownloadBodySchema,
  presignUploadBodySchema,
} from "./file.validation.js";

function resolveTenantOrgId(req: Request): string | null {
  const h = req.headers["x-org-id"] ?? req.headers["X-Org-Id"];
  if (typeof h === "string" && h.length > 0) {
    return h;
  }
  const q = req.query.org_id;
  if (typeof q === "string" && q.length > 0) {
    return q;
  }
  if (typeof req.tenantId === "string" && req.tenantId.length > 0) {
    return req.tenantId;
  }
  return null;
}

@injectable()
export class FilesController {
  constructor(@inject(TYPES.FileService) private readonly files: FileService) {}

  presignUpload = async (req: Request, res: Response): Promise<void> => {
    const orgId = resolveTenantOrgId(req);
    if (orgId === null || orgId.length === 0) {
      res.status(400).json({
        error: "org_required",
        message: "Provide tenant org via x-org-id header or org_id query",
      });
      return;
    }

    const parsed = presignUploadBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    try {
      const out = await this.files.getUploadUrl(
        orgId,
        parsed.data.filename,
        parsed.data.contentType,
        parsed.data.contentLengthBytes,
      );
      res.status(200).json({ data: out });
    } catch (e) {
      this.handleError(res, e);
    }
  };

  presignDownload = async (req: Request, res: Response): Promise<void> => {
    const orgId = resolveTenantOrgId(req);
    if (orgId === null || orgId.length === 0) {
      res.status(400).json({
        error: "org_required",
        message: "Provide tenant org via x-org-id header or org_id query",
      });
      return;
    }

    const parsed = presignDownloadBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_body", details: parsed.error.flatten() });
      return;
    }

    try {
      const out = await this.files.getDownloadUrl(orgId, parsed.data.key);
      res.status(200).json({ data: out });
    } catch (e) {
      this.handleError(res, e);
    }
  };

  private handleError(res: Response, e: unknown): void {
    if (e instanceof FileServiceError) {
      if (e.code === "not_configured") {
        res.status(503).json({ error: "s3_unavailable", message: e.message });
        return;
      }
      res.status(400).json({ error: "bad_request", message: e.message });
      return;
    }
    process.stderr.write(`[files] presign error: ${String(e)}\n`);
    res.status(500).json({ error: "internal_error" });
  }
}
