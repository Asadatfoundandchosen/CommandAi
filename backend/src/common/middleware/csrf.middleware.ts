import { config } from "@config/index.js";
import type { NextFunction, Request, RequestHandler, Response } from "express";

import {
  CSRF_REQUEST_HEADER,
  readCsrfTokenFromCookie,
  usesCookieAuth,
} from "../cookies/auth-cookies.js";

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Paths that establish or rotate tokens — CSRF is issued in the response instead of validated.
 * Stripe webhooks use HMAC, not browser cookies.
 */
export const CSRF_EXEMPT_PATHS = [
  "/api/v1/auth/login",
  "/api/v1/auth/magic-link/send",
  "/api/v1/auth/magic-link/verify",
  "/api/v1/auth/mfa/sms/send-login",
  "/api/billing/stripe/webhook",
] as const;

/** SAML ACS posts are exempt (path includes org id). */
function isSamlAuthExempt(path: string): boolean {
  return /^\/api\/v1\/auth\/saml\/[a-fA-F0-9]{24}\/(callback|login)$/.test(path);
}

/** OIDC login/callback GET redirects are exempt (path includes org id). */
function isOidcAuthExempt(path: string): boolean {
  return /^\/api\/v1\/auth\/oidc\/[a-fA-F0-9]{24}\/(callback|login)$/.test(path);
}

function normalizedPath(req: Request): string {
  return (req.baseUrl + req.path).split("?")[0] ?? req.path;
}

function isExemptPath(path: string): boolean {
  return CSRF_EXEMPT_PATHS.some(
    (exempt) => path === exempt || path.startsWith(`${exempt}/`),
  );
}

function readCsrfHeader(req: Request): string | undefined {
  const raw = req.get(CSRF_REQUEST_HEADER);
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
}

/**
 * Validates **double-submit** CSRF for cookie-based browser clients.
 * Requires `X-CSRF-Token` request header to match the `1cmd_csrf` cookie.
 * Bearer-only API clients (no auth cookies) are not required to send CSRF.
 */
export function createCsrfMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!config.csrf.enabled) {
      next();
      return;
    }

    if (!MUTATION_METHODS.has(req.method.toUpperCase())) {
      next();
      return;
    }

    const path = normalizedPath(req);
    if (isExemptPath(path) || isSamlAuthExempt(path) || isOidcAuthExempt(path)) {
      next();
      return;
    }

    if (!usesCookieAuth(req)) {
      next();
      return;
    }

    const headerToken = readCsrfHeader(req);
    const cookieToken = readCsrfTokenFromCookie(req);
    if (
      headerToken &&
      cookieToken &&
      headerToken.length > 0 &&
      headerToken === cookieToken
    ) {
      next();
      return;
    }

    res.status(403).json({
      error: "Invalid or missing CSRF token",
      code: "csrf_failed",
    });
  };
}
