import type { CookieOptions, Request, Response } from "express";
import { randomUUID } from "node:crypto";

import { config } from "@config/index.js";
import { REFRESH_TOKEN_TTL_SEC } from "@modules/auth/jwt.service.js";

/** Response header clients must echo on state-changing requests (double-submit). */
export const CSRF_RESPONSE_HEADER = "X-CSRF-Token" as const;

/** Request header that must match the CSRF cookie when cookie auth is used. */
export const CSRF_REQUEST_HEADER = "x-csrf-token" as const;

/** Shared secure cookie defaults — HttpOnly blocks XSS; Secure requires HTTPS; SameSite blocks CSRF. */
export function buildHttpOnlyCookieOptions(maxAgeMs: number): CookieOptions {
  const { cookies } = config;
  return {
    httpOnly: true,
    secure: cookies.secure,
    sameSite: cookies.sameSite,
    maxAge: maxAgeMs,
    path: cookies.path,
    ...(cookies.domain ? { domain: cookies.domain } : {}),
  };
}

/** CSRF cookie is readable by same-origin JS so SPAs can mirror it into `X-CSRF-Token`. */
export function buildCsrfCookieOptions(maxAgeMs: number): CookieOptions {
  return {
    ...buildHttpOnlyCookieOptions(maxAgeMs),
    httpOnly: false,
  };
}

export function buildClearCookieOptions(): CookieOptions {
  const { cookies } = config;
  return {
    path: cookies.path,
    ...(cookies.domain ? { domain: cookies.domain } : {}),
    secure: cookies.secure,
    sameSite: cookies.sameSite,
  };
}

/** Refresh token httpOnly cookie (7d, aligned with JWT refresh TTL). */
export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  if (!config.cookies.refreshInCookie) {
    return;
  }
  res.cookie(
    config.cookies.refreshTokenName,
    refreshToken,
    buildHttpOnlyCookieOptions(REFRESH_TOKEN_TTL_SEC * 1000),
  );
}

/** Issue a new CSRF token (cookie + response header). */
export function issueCsrfToken(res: Response): string {
  const token = randomUUID();
  res.cookie(
    config.cookies.csrfTokenName,
    token,
    buildCsrfCookieOptions(REFRESH_TOKEN_TTL_SEC * 1000),
  );
  res.setHeader(CSRF_RESPONSE_HEADER, token);
  return token;
}

export function clearAuthCookies(res: Response): void {
  const clearOpts = buildClearCookieOptions();
  res.clearCookie(config.cookies.refreshTokenName, clearOpts);
  res.clearCookie(config.cookies.csrfTokenName, {
    ...clearOpts,
    httpOnly: false,
  });
  res.removeHeader(CSRF_RESPONSE_HEADER);
}

/** Read refresh token from httpOnly cookie (browser clients). */
export function readRefreshTokenFromCookie(req: Request): string | undefined {
  const raw = req.cookies?.[config.cookies.refreshTokenName];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/** Read CSRF token from cookie for double-submit validation. */
export function readCsrfTokenFromCookie(req: Request): string | undefined {
  const raw = req.cookies?.[config.cookies.csrfTokenName];
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/** Whether this request uses cookie-based auth (requires CSRF on mutations). */
export function usesCookieAuth(req: Request): boolean {
  return (
    readRefreshTokenFromCookie(req) !== undefined ||
    readCsrfTokenFromCookie(req) !== undefined
  );
}
