import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { UnauthorizedError } from "./auth.errors.js";
import { TYPES } from "../../types.js";
import {
  AccountLockedError,
  AmbiguousLoginError,
  AuthService,
  ForbiddenRevokeError,
  InactiveUserError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  MfaRequiredError,
  TokenReuseError,
  UserNotInOrgError,
} from "./auth.service.js";
import {
  InvalidMfaTokenError,
  MfaAlreadyEnabledError,
  MfaNotEnabledError,
  MfaNotPendingError,
  MfaService,
} from "./mfa.service.js";
import { readRefreshTokenFromCookie } from "@common/cookies/auth-cookies.js";
import { extractClientContext } from "./client-context.js";
import {
  applyAuthCookies,
  clearAuthCookiesOnLogout,
  toAuthResponseBody,
  toLoginResponseBody,
} from "./auth-response.js";
import {
  InvalidSmsCodeError,
  SmsMfaNotEnabledError,
  SmsMfaService,
  SmsMfaUnavailableError,
  SmsRateLimitError,
} from "./sms-mfa.service.js";
import {
  InvalidMagicLinkError,
  MagicLinkRateLimitError,
  MagicLinkService,
} from "./magic-link.service.js";
import {
  loginBodySchema,
  logoutBodySchema,
  mfaTotpDisableBodySchema,
  mfaBackupCodesRegenerateBodySchema,
  mfaTotpVerifyBodySchema,
  smsMfaSendBodySchema,
  smsMfaSendLoginBodySchema,
  smsMfaVerifyBodySchema,
  magicLinkSendBodySchema,
  magicLinkVerifyBodySchema,
  refreshBodySchema,
  revokeAllTokensBodySchema,
  sessionIdParamSchema,
} from "./auth.validation.js";
import { SessionNotFoundError } from "./auth-session.service.js";
import { SsoEnforcementService } from "./sso-enforcement.service.js";
import { SSORequiredError } from "./sso-enforcement.errors.js";
import { ssoLoginOptionsQuerySchema } from "./sso-enforcement.validation.js";

function parseBearer(req: Request): string | undefined {
  const auth = req.headers.authorization;
  return typeof auth === "string" && auth.startsWith("Bearer ")
    ? auth.slice("Bearer ".length).trim()
    : undefined;
}

@injectable()
export class AuthController {
  constructor(
    @inject(TYPES.AuthService) private readonly auth: AuthService,
    @inject(MfaService) private readonly mfa: MfaService,
    @inject(SmsMfaService) private readonly smsMfa: SmsMfaService,
    @inject(MagicLinkService) private readonly magicLink: MagicLinkService,
    @inject(SsoEnforcementService) private readonly ssoEnforcement: SsoEnforcementService,
  ) {}

  /** `GET /api/v1/auth/sso-login-options` — login page SSO redirect hints (public). */
  ssoLoginOptions = async (req: Request, res: Response): Promise<void> => {
    const parsed = ssoLoginOptionsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const data = await this.ssoEnforcement.getLoginOptions(
      parsed.data.email,
      parsed.data.org_id,
    );
    res.status(200).json({ data });
  };

  /** `POST /api/v1/auth/login` — email/password → access + refresh tokens. */
  login = async (req: Request, res: Response): Promise<void> => {
    const parsed = loginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const tokens = await this.auth.login(
        parsed.data.email,
        parsed.data.password,
        parsed.data.org_id,
        extractClientContext(req),
        {
          totp_code: parsed.data.totp_code,
          backup_code: parsed.data.backup_code,
          sms_code: parsed.data.sms_code,
        },
      );
      applyAuthCookies(res, tokens);
      res.status(200).json({ data: toLoginResponseBody(tokens) });
    } catch (e) {
      if (e instanceof AccountLockedError) {
        if (e.retryAfterSec > 0) {
          res.setHeader("Retry-After", String(e.retryAfterSec));
        }
        res.status(423).json({
          error: e.message,
          code: "account_locked",
          retryAfterSec: e.retryAfterSec,
        });
        return;
      }
      if (e instanceof MfaRequiredError) {
        res.status(403).json({ error: e.message, code: "mfa_required" });
        return;
      }
      if (e instanceof InvalidMfaTokenError || e instanceof InvalidSmsCodeError) {
        res.status(401).json({ error: e.message, code: "invalid_mfa" });
        return;
      }
      if (e instanceof InvalidCredentialsError) {
        res.status(401).json({ error: e.message });
        return;
      }
      if (e instanceof InactiveUserError) {
        res.status(403).json({ error: e.message });
        return;
      }
      if (e instanceof AmbiguousLoginError) {
        res.status(400).json({ error: e.message });
        return;
      }
      if (e instanceof SSORequiredError) {
        res.status(403).json({
          error: e.message,
          code: e.code,
          sso: e.sso,
        });
        return;
      }
      const message = e instanceof Error ? e.message : "Login failed";
      res.status(500).json({ error: message });
    }
  };

  /** `POST /api/v1/auth/magic-link/send` — email a one-time sign-in link (always 204). */
  sendMagicLink = async (req: Request, res: Response): Promise<void> => {
    const parsed = magicLinkSendBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      await this.magicLink.sendMagicLink(parsed.data.email, parsed.data.org_id);
      res.status(204).send();
    } catch (e) {
      if (e instanceof MagicLinkRateLimitError) {
        res.status(429).json({ error: e.message, code: "magic_link_rate_limited" });
        return;
      }
      const message = e instanceof Error ? e.message : "Failed to send magic link";
      res.status(500).json({ error: message });
    }
  };

  /** `POST /api/v1/auth/magic-link/verify` — consume token and issue JWT pair. */
  verifyMagicLink = async (req: Request, res: Response): Promise<void> => {
    const parsed = magicLinkVerifyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const tokens = await this.magicLink.verifyMagicLink(
        parsed.data.token,
        extractClientContext(req),
        {
          totp_code: parsed.data.totp_code,
          backup_code: parsed.data.backup_code,
          sms_code: parsed.data.sms_code,
        },
      );
      applyAuthCookies(res, tokens);
      res.status(200).json({ data: toLoginResponseBody(tokens) });
    } catch (e) {
      if (e instanceof InvalidMagicLinkError) {
        res.status(401).json({ error: e.message, code: "invalid_magic_link" });
        return;
      }
      if (e instanceof SSORequiredError) {
        res.status(403).json({
          error: e.message,
          code: e.code,
          sso: e.sso,
        });
        return;
      }
      if (e instanceof AccountLockedError) {
        if (e.retryAfterSec > 0) {
          res.setHeader("Retry-After", String(e.retryAfterSec));
        }
        res.status(423).json({
          error: e.message,
          code: "account_locked",
          retryAfterSec: e.retryAfterSec,
        });
        return;
      }
      if (e instanceof MfaRequiredError) {
        res.status(403).json({ error: e.message, code: "mfa_required" });
        return;
      }
      if (e instanceof InvalidMfaTokenError || e instanceof InvalidSmsCodeError) {
        res.status(401).json({ error: e.message, code: "invalid_mfa" });
        return;
      }
      if (e instanceof InvalidCredentialsError) {
        res.status(401).json({ error: e.message });
        return;
      }
      const message = e instanceof Error ? e.message : "Magic link verification failed";
      res.status(500).json({ error: message });
    }
  };

  /** `POST /api/v1/auth/refresh` — rotate access + refresh tokens (one-time refresh JTI). */
  refresh = async (req: Request, res: Response): Promise<void> => {
    const parsed = refreshBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const refreshToken =
      parsed.data.refreshToken ?? readRefreshTokenFromCookie(req);
    if (!refreshToken) {
      res.status(401).json({ error: "Refresh token required" });
      return;
    }
    try {
      const tokens = await this.auth.refreshTokens(refreshToken);
      applyAuthCookies(res, tokens);
      res.status(200).json({ data: toAuthResponseBody(tokens) });
    } catch (e) {
      if (e instanceof UnauthorizedError) {
        res.status(401).json({ error: e.message });
        return;
      }
      if (e instanceof TokenReuseError) {
        res.status(401).json({ error: e.message, code: "refresh_token_reuse" });
        return;
      }
      if (e instanceof InvalidRefreshTokenError) {
        res.status(401).json({ error: e.message });
        return;
      }
      const message = e instanceof Error ? e.message : "Refresh failed";
      res.status(500).json({ error: message });
    }
  };

  /** `POST /api/v1/auth/logout` — blacklist current access (+ optional refresh) token. */
  logout = async (req: Request, res: Response): Promise<void> => {
    const accessToken = parseBearer(req);
    if (!accessToken) {
      res.status(401).json({ error: "Authorization Bearer token required" });
      return;
    }
    const parsed = logoutBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const refreshToken =
        parsed.data.refreshToken ?? readRefreshTokenFromCookie(req);
      await this.auth.logout(
        accessToken,
        refreshToken,
        extractClientContext(req),
      );
      clearAuthCookiesOnLogout(res);
      res.status(204).send();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Logout failed";
      res.status(500).json({ error: message });
    }
  };

  /** `POST /api/v1/auth/revoke-all` — blacklist all tokens for caller or target user. */
  revokeAll = async (req: Request, res: Response): Promise<void> => {
    const parsed = revokeAllTokensBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const caller = req.user;
    if (!caller?.sub || !caller.org_id) {
      res.status(401).json({ error: "No user context" });
      return;
    }
    const role = typeof caller.role === "string" ? caller.role : "";
    try {
      const result = await this.auth.revokeAllUserTokens(
        caller.sub,
        caller.org_id,
        role,
        parsed.data.user_id,
        extractClientContext(req),
      );
      res.status(200).json({ data: result });
    } catch (e) {
      if (e instanceof ForbiddenRevokeError) {
        res.status(403).json({ error: e.message });
        return;
      }
      if (e instanceof UserNotInOrgError) {
        res.status(404).json({ error: e.message });
        return;
      }
      const message = e instanceof Error ? e.message : "Revoke failed";
      res.status(500).json({ error: message });
    }
  };

  /** `POST /api/v1/auth/mfa/totp/setup` — begin TOTP enrollment (QR + manual secret). */
  setupTotp = async (req: Request, res: Response): Promise<void> => {
    const caller = req.user;
    if (!caller?.sub) {
      res.status(401).json({ error: "No user context" });
      return;
    }
    try {
      const result = await this.mfa.setupTOTP(caller.sub);
      res.status(200).json({ data: result });
    } catch (e) {
      if (e instanceof MfaAlreadyEnabledError) {
        res.status(409).json({ error: e.message });
        return;
      }
      const message = e instanceof Error ? e.message : "TOTP setup failed";
      res.status(500).json({ error: message });
    }
  };

  /** `POST /api/v1/auth/mfa/totp/verify` — confirm TOTP and receive backup codes. */
  verifyTotp = async (req: Request, res: Response): Promise<void> => {
    const parsed = mfaTotpVerifyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const caller = req.user;
    if (!caller?.sub) {
      res.status(401).json({ error: "No user context" });
      return;
    }
    try {
      const result = await this.mfa.verifyAndEnableTOTP(
        caller.sub,
        parsed.data.token,
        extractClientContext(req),
      );
      res.status(200).json({ data: result });
    } catch (e) {
      if (e instanceof MfaNotPendingError) {
        res.status(400).json({ error: e.message });
        return;
      }
      if (e instanceof InvalidMfaTokenError) {
        res.status(401).json({ error: e.message, code: "invalid_mfa" });
        return;
      }
      const message = e instanceof Error ? e.message : "TOTP verify failed";
      res.status(500).json({ error: message });
    }
  };

  /** `GET /api/v1/auth/mfa/backup-codes` — remaining count and low-balance warning. */
  getBackupCodesStatus = async (req: Request, res: Response): Promise<void> => {
    const caller = req.user;
    if (!caller?.sub) {
      res.status(401).json({ error: "No user context" });
      return;
    }
    try {
      const status = await this.mfa.getBackupCodeStatus(caller.sub);
      res.status(200).json({ data: status });
    } catch (e) {
      if (e instanceof MfaNotEnabledError) {
        res.status(404).json({ error: e.message });
        return;
      }
      const message = e instanceof Error ? e.message : "Failed to load backup codes";
      res.status(500).json({ error: message });
    }
  };

  /**
   * `POST /api/v1/auth/mfa/backup-codes/regenerate` — new set of 10 codes (invalidates old).
   * Requires TOTP; returns plaintext codes once.
   */
  regenerateBackupCodes = async (req: Request, res: Response): Promise<void> => {
    const parsed = mfaBackupCodesRegenerateBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const caller = req.user;
    if (!caller?.sub) {
      res.status(401).json({ error: "No user context" });
      return;
    }
    try {
      const result = await this.mfa.regenerateBackupCodes(
        caller.sub,
        parsed.data.token,
      );
      res.status(200).json({ data: result });
    } catch (e) {
      if (e instanceof MfaNotEnabledError) {
        res.status(404).json({ error: e.message });
        return;
      }
      if (e instanceof InvalidMfaTokenError) {
        res.status(401).json({ error: e.message, code: "invalid_mfa" });
        return;
      }
      const message =
        e instanceof Error ? e.message : "Backup code regeneration failed";
      res.status(500).json({ error: message });
    }
  };

  /** `DELETE /api/v1/auth/mfa/totp` — disable TOTP (requires valid code). */
  disableTotp = async (req: Request, res: Response): Promise<void> => {
    const parsed = mfaTotpDisableBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const caller = req.user;
    if (!caller?.sub) {
      res.status(401).json({ error: "No user context" });
      return;
    }
    try {
      await this.mfa.disableTOTP(
        caller.sub,
        parsed.data.token,
        extractClientContext(req),
      );
      res.status(204).send();
    } catch (e) {
      if (e instanceof MfaNotEnabledError) {
        res.status(404).json({ error: e.message });
        return;
      }
      if (e instanceof InvalidMfaTokenError) {
        res.status(401).json({ error: e.message, code: "invalid_mfa" });
        return;
      }
      const message = e instanceof Error ? e.message : "TOTP disable failed";
      res.status(500).json({ error: message });
    }
  };

  /** `POST /api/v1/auth/mfa/sms/send` — send 6-digit SMS code (authenticated setup). */
  sendSmsMfa = async (req: Request, res: Response): Promise<void> => {
    const parsed = smsMfaSendBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const caller = req.user;
    if (!caller?.sub) {
      res.status(401).json({ error: "No user context" });
      return;
    }
    try {
      await this.smsMfa.sendSMSCode(caller.sub, parsed.data.phone_number);
      res.status(204).send();
    } catch (e) {
      if (e instanceof SmsRateLimitError) {
        res.status(429).json({ error: e.message, code: "sms_rate_limited" });
        return;
      }
      if (e instanceof SmsMfaUnavailableError) {
        res.status(503).json({ error: e.message });
        return;
      }
      const message = e instanceof Error ? e.message : "SMS send failed";
      res.status(500).json({ error: message });
    }
  };

  /** `POST /api/v1/auth/mfa/sms/send-login` — send SMS code before login (password required). */
  sendSmsMfaLogin = async (req: Request, res: Response): Promise<void> => {
    const parsed = smsMfaSendLoginBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      await this.auth.sendLoginSmsCode(
        parsed.data.email,
        parsed.data.password,
        parsed.data.org_id,
      );
      res.status(204).send();
    } catch (e) {
      if (e instanceof SmsRateLimitError) {
        res.status(429).json({ error: e.message, code: "sms_rate_limited" });
        return;
      }
      if (e instanceof SmsMfaUnavailableError) {
        res.status(503).json({ error: e.message });
        return;
      }
      if (e instanceof InvalidCredentialsError) {
        res.status(401).json({ error: e.message });
        return;
      }
      const message = e instanceof Error ? e.message : "SMS send failed";
      res.status(500).json({ error: message });
    }
  };

  /** `POST /api/v1/auth/mfa/sms/verify` — verify SMS code and enable SMS MFA. */
  verifySmsMfa = async (req: Request, res: Response): Promise<void> => {
    const parsed = smsMfaVerifyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const caller = req.user;
    if (!caller?.sub) {
      res.status(401).json({ error: "No user context" });
      return;
    }
    try {
      const result = await this.smsMfa.verifyAndEnableSmsMfa(
        caller.sub,
        parsed.data.code,
        extractClientContext(req),
      );
      res.status(200).json({ data: result });
    } catch (e) {
      if (e instanceof InvalidSmsCodeError) {
        res.status(401).json({ error: e.message, code: "invalid_sms_code" });
        return;
      }
      const message = e instanceof Error ? e.message : "SMS verify failed";
      res.status(500).json({ error: message });
    }
  };

  /** `DELETE /api/v1/auth/mfa/sms` — disable SMS MFA. */
  disableSmsMfa = async (req: Request, res: Response): Promise<void> => {
    const caller = req.user;
    if (!caller?.sub) {
      res.status(401).json({ error: "No user context" });
      return;
    }
    try {
      await this.smsMfa.disableSmsMfa(caller.sub, extractClientContext(req));
      res.status(204).send();
    } catch (e) {
      if (e instanceof SmsMfaNotEnabledError) {
        res.status(404).json({ error: e.message });
        return;
      }
      const message = e instanceof Error ? e.message : "SMS MFA disable failed";
      res.status(500).json({ error: message });
    }
  };

  /** `GET /api/v1/auth/sessions` — list active sessions for the caller. */
  listSessions = async (req: Request, res: Response): Promise<void> => {
    const caller = req.user;
    if (!caller?.sub) {
      res.status(401).json({ error: "No user context" });
      return;
    }
    try {
      const sessions = await this.auth.listMySessions(
        caller.sub,
        typeof caller.sid === "string" ? caller.sid : undefined,
      );
      res.status(200).json({ data: sessions });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to list sessions";
      res.status(500).json({ error: message });
    }
  };

  /** `DELETE /api/v1/auth/sessions/:id` — revoke one session. */
  revokeSession = async (req: Request, res: Response): Promise<void> => {
    const parsed = sessionIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const caller = req.user;
    if (!caller?.sub) {
      res.status(401).json({ error: "No user context" });
      return;
    }
    try {
      await this.auth.revokeMySession(
        caller.sub,
        parsed.data.id,
        extractClientContext(req),
        caller.org_id,
      );
      res.status(204).send();
    } catch (e) {
      if (e instanceof SessionNotFoundError) {
        res.status(404).json({ error: e.message });
        return;
      }
      const message = e instanceof Error ? e.message : "Failed to revoke session";
      res.status(500).json({ error: message });
    }
  };

  /** `DELETE /api/v1/auth/sessions` — revoke all sessions and tokens for the caller. */
  revokeAllSessions = async (req: Request, res: Response): Promise<void> => {
    const caller = req.user;
    if (!caller?.sub) {
      res.status(401).json({ error: "No user context" });
      return;
    }
    try {
      const result = await this.auth.revokeAllMySessions(
        caller.sub,
        caller.org_id,
        extractClientContext(req),
      );
      clearAuthCookiesOnLogout(res);
      res.status(200).json({ data: result });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Failed to revoke all sessions";
      res.status(500).json({ error: message });
    }
  };
}
