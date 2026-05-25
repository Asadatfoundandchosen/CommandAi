import type { Container } from "inversify";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { extractApiKeyFromRequest } from "./api-key.crypto.js";
import {
  ApiKeyInactiveError,
  ApiKeyService,
  InvalidApiKeyError,
} from "./api-key.service.js";

/**
 * Authenticates requests with `X-API-Key` or `Authorization: Bearer 1cmd_…`.
 * Sets `req.tenantId`, `req.apiKeyId`, `req.apiKeyAccountId`, `req.userPermissions`.
 */
export function createApiKeyAuthMiddleware(container: Container): RequestHandler {
  const apiKeys = container.get(ApiKeyService);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const raw = extractApiKeyFromRequest(req.headers);
    if (!raw) {
      res.status(401).json({ error: "API key required", code: "api_key_required" });
      return;
    }

    try {
      const ctx = await apiKeys.authenticate(raw);
      req.tenantId = ctx.orgId;
      req.apiKeyId = ctx.apiKeyId;
      req.apiKeyAccountId = ctx.accountId;
      req.userPermissions = ctx.permissions;
      req.apiKeyRateLimit = ctx.rateLimit;
      next();
    } catch (e) {
      if (e instanceof InvalidApiKeyError || e instanceof ApiKeyInactiveError) {
        res.status(401).json({ error: "Unauthorized", code: "invalid_api_key" });
        return;
      }
      const message = e instanceof Error ? e.message : "API key authentication failed";
      res.status(500).json({ error: message, code: "api_key_auth_failed" });
    }
  };
}

/** Optional: accept API key or JWT (JWT must run first on the chain). */
export function createOptionalApiKeyAuthMiddleware(container: Container): RequestHandler {
  const apiKeys = container.get(ApiKeyService);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (req.user?.org_id) {
      next();
      return;
    }

    const raw = extractApiKeyFromRequest(req.headers);
    if (!raw) {
      next();
      return;
    }

    try {
      const ctx = await apiKeys.authenticate(raw);
      req.tenantId = ctx.orgId;
      req.apiKeyId = ctx.apiKeyId;
      req.apiKeyAccountId = ctx.accountId;
      req.userPermissions = ctx.permissions;
      req.apiKeyRateLimit = ctx.rateLimit;
      next();
    } catch (e) {
      if (e instanceof InvalidApiKeyError || e instanceof ApiKeyInactiveError) {
        res.status(401).json({ error: "Unauthorized", code: "invalid_api_key" });
        return;
      }
      const message = e instanceof Error ? e.message : "API key authentication failed";
      res.status(500).json({ error: message, code: "api_key_auth_failed" });
    }
  };
}
