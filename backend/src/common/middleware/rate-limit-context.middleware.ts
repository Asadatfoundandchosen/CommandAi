import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";

import { API_KEY_PREFIX, extractApiKeyFromRequest } from "@modules/api-keys/api-key.crypto.js";
import type { TokenPayload } from "@modules/auth/jwt.service.js";

function parseBearer(req: Request): string | undefined {
  const auth = req.headers.authorization;
  return typeof auth === "string" && auth.startsWith("Bearer ")
    ? auth.slice("Bearer ".length).trim()
    : undefined;
}

/**
 * Populates `req.tenantId` / `req.userId` for rate limiting **before** full JWT auth.
 * Uses unsigned JWT decode for tagging only — not authorization.
 */
export function createRateLimitContextMiddleware(): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const apiKey = extractApiKeyFromRequest(req.headers);
    if (apiKey?.startsWith(API_KEY_PREFIX)) {
      next();
      return;
    }

    const bearer = parseBearer(req);
    if (!bearer || bearer.startsWith(API_KEY_PREFIX)) {
      next();
      return;
    }

    const decoded = jwt.decode(bearer);
    if (!decoded || typeof decoded === "string") {
      next();
      return;
    }

    const claims = decoded as TokenPayload;
    if (claims.type === "access" && claims.org_id) {
      req.tenantId = claims.org_id.toLowerCase();
    }
    if (claims.sub) {
      req.userId = claims.sub;
    }

    next();
  };
}
