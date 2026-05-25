import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { InvalidPermissionsError } from "@modules/rbac/permissions.js";
import {
  AccountNotInOrganizationError,
  ApiKeyInactiveError,
  ApiKeyNotFoundError,
  ApiKeyService,
  InvalidApiKeyError,
  OrganizationNotFoundError,
} from "./api-key.service.js";
import { AdminAuditService } from "../audit/admin-audit.service.js";
import {
  apiKeyIdParamSchema,
  createApiKeyBodySchema,
  listApiKeysQuerySchema,
  updateApiKeyBodySchema,
} from "./api-key.validation.js";

@injectable()
export class ApiKeyController {
  constructor(
    @inject(ApiKeyService) private readonly apiKeys: ApiKeyService,
    @inject(AdminAuditService) private readonly adminAudit: AdminAuditService,
  ) {}

  create = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    const userId = req.user?.sub;
    if (!orgId || !userId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }

    const parsed = createApiKeyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    try {
      const auditActor = this.adminAudit.actorFromRequest(req) ?? undefined;
      const created = await this.apiKeys.createKey(orgId, userId, parsed.data, auditActor);
      res.status(201).json({
        data: created,
        message: "Store the key securely; it will not be shown again.",
      });
    } catch (e) {
      this.sendError(res, e);
    }
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }

    const queryParsed = listApiKeysQuerySchema.safeParse(req.query);
    if (!queryParsed.success) {
      res.status(400).json({ error: "Validation failed", details: queryParsed.error.flatten() });
      return;
    }

    try {
      const keys = await this.apiKeys.listKeys(orgId, queryParsed.data);
      res.status(200).json({ data: keys });
    } catch (e) {
      this.sendError(res, e);
    }
  };

  getById = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }

    const idParsed = apiKeyIdParamSchema.safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid API key id" });
      return;
    }

    try {
      const key = await this.apiKeys.getById(orgId, idParsed.data);
      res.status(200).json({ data: key });
    } catch (e) {
      this.sendError(res, e);
    }
  };

  update = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    const userId = req.user?.sub;
    if (!orgId || !userId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }

    const idParsed = apiKeyIdParamSchema.safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid API key id" });
      return;
    }

    const bodyParsed = updateApiKeyBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      res.status(400).json({ error: "Validation failed", details: bodyParsed.error.flatten() });
      return;
    }

    try {
      const auditActor = this.adminAudit.actorFromRequest(req) ?? undefined;
      const updated = await this.apiKeys.updateKey(
        orgId,
        idParsed.data,
        userId,
        bodyParsed.data,
        auditActor,
      );
      res.status(200).json({ data: updated });
    } catch (e) {
      this.sendError(res, e);
    }
  };

  revoke = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    const userId = req.user?.sub;
    if (!orgId || !userId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }

    const idParsed = apiKeyIdParamSchema.safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid API key id" });
      return;
    }

    try {
      const auditActor = this.adminAudit.actorFromRequest(req) ?? undefined;
      const revoked = await this.apiKeys.revokeKey(
        orgId,
        idParsed.data,
        userId,
        auditActor,
      );
      res.status(200).json({ data: revoked });
    } catch (e) {
      this.sendError(res, e);
    }
  };

  rotate = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    const userId = req.user?.sub;
    if (!orgId || !userId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }

    const idParsed = apiKeyIdParamSchema.safeParse(req.params.id);
    if (!idParsed.success) {
      res.status(400).json({ error: "Invalid API key id" });
      return;
    }

    try {
      const auditActor = this.adminAudit.actorFromRequest(req) ?? undefined;
      const rotated = await this.apiKeys.rotateKey(
        orgId,
        idParsed.data,
        userId,
        auditActor,
      );
      res.status(200).json({
        data: rotated,
        message: "Store the new key securely; it will not be shown again.",
      });
    } catch (e) {
      this.sendError(res, e);
    }
  };

  private sendError(res: Response, e: unknown): void {
    if (e instanceof ApiKeyNotFoundError) {
      res.status(404).json({ error: e.message, code: "api_key_not_found" });
      return;
    }
    if (e instanceof OrganizationNotFoundError || e instanceof AccountNotInOrganizationError) {
      res.status(400).json({ error: e.message, code: "hierarchy_invalid" });
      return;
    }
    if (e instanceof InvalidPermissionsError) {
      res.status(400).json({ error: e.message, code: "invalid_permissions" });
      return;
    }
    if (e instanceof InvalidApiKeyError || e instanceof ApiKeyInactiveError) {
      res.status(401).json({ error: "Unauthorized", code: "invalid_api_key" });
      return;
    }
    const message = e instanceof Error ? e.message : "API key operation failed";
    res.status(500).json({ error: message, code: "api_key_error" });
  }
}
