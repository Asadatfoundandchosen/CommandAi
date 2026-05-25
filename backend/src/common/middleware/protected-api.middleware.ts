import type { Container } from "inversify";
import type { RequestHandler } from "express";

import { createAuthenticateJwt } from "./jwt-auth.middleware.js";
import { createMfaEnforcementMiddleware } from "./mfa-enforcement.middleware.js";
import { tenantMiddleware } from "./tenant.middleware.js";

/** JWT auth + tenant scope + org MFA enforcement for tenant APIs. */
export function createProtectedApiMiddleware(container: Container): RequestHandler[] {
  return [
    createAuthenticateJwt(container),
    tenantMiddleware,
    createMfaEnforcementMiddleware(container),
  ];
}
