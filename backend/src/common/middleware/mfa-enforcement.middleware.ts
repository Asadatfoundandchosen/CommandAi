import type { Container } from "inversify";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import { config } from "@config/index.js";
import { MFA_SETUP_PATH } from "@modules/mfa-policy/mfa-policy.constants.js";
import { MfaPolicyService } from "@modules/mfa-policy/mfa-policy.service.js";

/** Paths that skip org MFA enforcement (auth setup, policy admin, platform APIs). */
export const MFA_ENFORCEMENT_EXEMPT_PREFIXES = [
  "/api/v1/auth",
  "/api/organizations",
  "/api/billing/stripe/webhook",
  "/api/docs",
  "/health",
] as const;

function normalizedPath(req: Request): string {
  return (req.baseUrl + req.path).split("?")[0] ?? req.path;
}

function isExemptPath(path: string): boolean {
  if (
    path === "/api/v1/organization/mfa-policy" ||
    path === "/api/v1/organization/saml" ||
    path === "/api/v1/organization/oidc" ||
    path === "/api/v1/organization/sso-mapping" ||
    path === "/api/v1/organization/group-mapping" ||
    path === "/api/v1/organization/sso-enforcement" ||
    path === "/api/v1/organization/scim" ||
    path.startsWith("/api/v1/organization/emergency-access")
  ) {
    return true;
  }
  return MFA_ENFORCEMENT_EXEMPT_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Blocks tenant API access when org MFA policy is enforced and the user has no compliant MFA.
 * During grace period, requests proceed with `X-MFA-Enforcement-*` headers.
 */
export function createMfaEnforcementMiddleware(container: Container): RequestHandler {
  const policies = container.get(MfaPolicyService);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const path = normalizedPath(req);
    if (isExemptPath(path)) {
      next();
      return;
    }

    const tenantId = req.tenantId;
    const user = req.user;
    if (!tenantId || !user?.sub || !user.role) {
      next();
      return;
    }

    const setupUrl = `${config.appUrl.replace(/\/$/, "")}${MFA_SETUP_PATH}`;

    try {
      const evaluation = await policies.evaluateForUser(
        tenantId,
        user.sub,
        user.role,
        setupUrl,
      );

      if (!evaluation) {
        next();
        return;
      }

      if (evaluation.in_grace_period && evaluation.grace_period_end) {
        res.setHeader(
          "X-MFA-Enforcement-Grace-Until",
          evaluation.grace_period_end.toISOString(),
        );
        if (evaluation.days_remaining !== undefined) {
          res.setHeader(
            "X-MFA-Enforcement-Days-Remaining",
            String(evaluation.days_remaining),
          );
        }
      }

      if (evaluation.blocked) {
        res.status(403).json({
          error: "MFA required",
          code: "mfa_enforcement",
          setup_url: evaluation.setup_url,
          grace_period_end: evaluation.grace_period_end?.toISOString(),
        });
        return;
      }

      next();
    } catch (err) {
      const message = err instanceof Error ? err.message : "MFA enforcement check failed";
      res.status(500).json({ error: message });
    }
  };
}
