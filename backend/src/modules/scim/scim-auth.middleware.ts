import type { Container } from "inversify";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { logScimOperation } from "./scim.logger.js";
import { ScimService } from "./scim.service.js";

export type ScimAuthenticatedRequest = Request & {
  scimOrgId?: string;
};

function parseBearer(authHeader: string | undefined): string | null {
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export function scimError(
  res: Response,
  status: number,
  detail: string,
  scimType?: string,
): void {
  res.status(status).json({
    schemas: ["urn:ietf:params:scim:api:messages:2.0:Error"],
    status: String(status),
    scimType: scimType ?? "invalidValue",
    detail,
  });
}

/** Validates SCIM bearer token and sets `req.scimOrgId`. */
export function createScimAuthMiddleware(container: Container): RequestHandler {
  const scim = container.get(ScimService);

  return async (req: ScimAuthenticatedRequest, res: Response, next: NextFunction) => {
    const token = parseBearer(req.get("Authorization"));
    if (!token) {
      logScimOperation("scim_auth_failed", { reason: "missing_bearer" });
      scimError(res, 401, "Authorization bearer token required", "invalidCredentials");
      return;
    }

    const orgId = await scim.resolveOrgFromBearerToken(token);
    if (!orgId) {
      logScimOperation("scim_auth_failed", { reason: "invalid_token" });
      scimError(res, 401, "Invalid SCIM bearer token", "invalidCredentials");
      return;
    }

    req.scimOrgId = orgId;
    next();
  };
}
