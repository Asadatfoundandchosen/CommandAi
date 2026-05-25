import type { Response } from "express";

import { config } from "@config/index.js";
import {
  clearAuthCookies,
  issueCsrfToken,
  setRefreshTokenCookie,
} from "@common/cookies/auth-cookies.js";

import type { AuthTokens } from "./jwt.service.js";
import type { LoginResult } from "./auth.service.js";

/** Set httpOnly refresh cookie + CSRF header/cookie on successful auth. */
export function applyAuthCookies(res: Response, tokens: AuthTokens): void {
  setRefreshTokenCookie(res, tokens.refreshToken);
  issueCsrfToken(res);
}

/** Strip `refreshToken` from JSON when only cookie transport is desired. */
export function toAuthResponseBody<T extends AuthTokens>(
  tokens: T,
): Omit<T, "refreshToken"> | T {
  if (config.cookies.refreshInResponseBody) {
    return tokens;
  }
  const { refreshToken: _rt, ...rest } = tokens;
  return rest;
}

export function toLoginResponseBody(result: LoginResult) {
  const base = toAuthResponseBody(result);
  return {
    ...base,
    ...(result.passwordChangeRequired
      ? {
          passwordChangeRequired: true,
          ...(result.passwordFeedback
            ? { passwordFeedback: result.passwordFeedback }
            : {}),
        }
      : {}),
  };
}

export function clearAuthCookiesOnLogout(res: Response): void {
  clearAuthCookies(res);
}
