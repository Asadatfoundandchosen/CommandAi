import { randomUUID } from "node:crypto";
import { inject, injectable } from "inversify";

import type { IUser } from "@modules/user/user.model.js";
import { UserModel } from "@modules/user/user.model.js";
import { TYPES } from "../../types.js";

import { logAuthTokenOperation } from "./auth-token.logger.js";
import type { AuthTokenPair, AuthTokens } from "./jwt.service.js";
import { JwtService } from "./jwt.service.js";
import {
  PasswordService,
  type PasswordValidationFeedback,
} from "./password.service.js";
import { UnauthorizedError } from "./auth.errors.js";
import { RefreshTokenStore } from "./refresh-token.store.js";
import { TokenBlacklistService } from "./token-blacklist.service.js";
import { LockoutAlertService } from "./lockout-alert.service.js";
import { LockoutService } from "./lockout.service.js";
import { TokenReuseAlertService } from "./token-reuse-alert.service.js";
import type { ClientContext } from "./auth-session.types.js";
import {
  AuthSessionService,
  SessionNotFoundError,
} from "./auth-session.service.js";
import {
  InvalidMfaTokenError,
  MfaService,
} from "./mfa.service.js";
import { SmsMfaService } from "./sms-mfa.service.js";
import { SsoEnforcementService } from "./sso-enforcement.service.js";

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid email or password");
    this.name = "InvalidCredentialsError";
  }
}

export class AccountLockedError extends Error {
  readonly retryAfterSec: number;

  constructor(retryAfterSec = 0) {
    super("Account temporarily locked due to too many failed login attempts");
    this.name = "AccountLockedError";
    this.retryAfterSec = retryAfterSec;
  }
}

export class InactiveUserError extends Error {
  constructor() {
    super("User account is not active");
    this.name = "InactiveUserError";
  }
}

export class AmbiguousLoginError extends Error {
  constructor() {
    super("Multiple accounts match this email; provide org_id");
    this.name = "AmbiguousLoginError";
  }
}

export class InvalidRefreshTokenError extends Error {
  constructor() {
    super("Invalid or expired refresh token");
    this.name = "InvalidRefreshTokenError";
  }
}

export class TokenReuseError extends Error {
  constructor() {
    super("Refresh token already used");
    this.name = "TokenReuseError";
  }
}

export class ForbiddenRevokeError extends Error {
  constructor() {
    super("Only org_admin may revoke tokens for other users");
    this.name = "ForbiddenRevokeError";
  }
}

export class UserNotInOrgError extends Error {
  constructor() {
    super("User not found in organization");
    this.name = "UserNotInOrgError";
  }
}

export class MfaRequiredError extends Error {
  constructor() {
    super("Multi-factor authentication code required");
    this.name = "MfaRequiredError";
  }
}

export type LoginResult = AuthTokens & {
  passwordChangeRequired: boolean;
  passwordFeedback?: PasswordValidationFeedback;
};

@injectable()
export class AuthService {
  constructor(
    @inject(JwtService) private readonly jwt: JwtService,
    @inject(RefreshTokenStore) private readonly refreshStore: RefreshTokenStore,
    @inject(TokenBlacklistService)
    private readonly tokenBlacklist: TokenBlacklistService,
    @inject(TokenReuseAlertService)
    private readonly tokenReuseAlert: TokenReuseAlertService,
    @inject(TYPES.PasswordService) private readonly passwords: PasswordService,
    @inject(LockoutService) private readonly lockout: LockoutService,
    @inject(LockoutAlertService) private readonly lockoutAlert: LockoutAlertService,
    @inject(AuthSessionService) private readonly sessions: AuthSessionService,
    @inject(MfaService) private readonly mfa: MfaService,
    @inject(SmsMfaService) private readonly smsMfa: SmsMfaService,
    @inject(SsoEnforcementService) private readonly ssoEnforcement: SsoEnforcementService,
  ) {}

  async login(
    email: string,
    password: string,
    orgIdHint?: string,
    clientContext?: ClientContext,
    mfaCode?: { totp_code?: string; backup_code?: string; sms_code?: string },
  ): Promise<LoginResult> {
    const users = await this.findActiveUsersByEmail(email, orgIdHint);
    if (users.length === 0) {
      logAuthTokenOperation("login_failed", { reason: "invalid_credentials" });
      throw new InvalidCredentialsError();
    }
    if (users.length > 1) {
      logAuthTokenOperation("login_failed", { reason: "ambiguous_email" });
      throw new AmbiguousLoginError();
    }
    const user = users[0];
    const userId = String(user._id);

    await this.ssoEnforcement.checkSSOEnforcement(
      String(user.org_id),
      "password",
      user.email,
    );

    if (await this.lockout.isLocked(userId)) {
      const retryAfterSec = await this.lockout.getLockedRemainingSec(userId);
      logAuthTokenOperation("login_failed", {
        reason: "account_locked",
        user_id: userId,
        retry_after_sec: retryAfterSec,
      });
      throw new AccountLockedError(retryAfterSec);
    }

    const passwordOk = await this.passwords.verifyPassword(
      password,
      user.password_hash,
    );
    if (!passwordOk) {
      const lockResult = await this.lockout.recordFailedAttempt(userId);
      logAuthTokenOperation("login_failed", {
        reason: "invalid_credentials",
        user_id: userId,
        failed_attempts: lockResult.attempts,
      });
      if (lockResult.locked) {
        await this.lockoutAlert.alertLockout({
          userId,
          attempts: lockResult.attempts,
          durationSec: lockResult.duration,
        });
        throw new AccountLockedError(lockResult.duration);
      }
      throw new InvalidCredentialsError();
    }
    if (user.status !== "active") {
      logAuthTokenOperation("login_failed", {
        reason: "inactive",
        user_id: String(user._id),
      });
      throw new InactiveUserError();
    }

    await this.assertMfaIfRequired(user, userId, mfaCode);

    const userInputs = [
      user.email,
      user.first_name,
      user.last_name,
      email.split("@")[0] ?? "",
    ];
    const strength = this.passwords.validatePasswordStrength(password, userInputs);
    const legacyHash = this.passwords.needsPasswordUpgrade(user.password_hash);
    const passwordChangeRequired =
      user.password_change_required ||
      legacyHash ||
      !strength.valid;

    return this.finalizeSuccessfulLogin(
      user,
      userId,
      clientContext,
      passwordChangeRequired,
      !strength.valid ? strength.feedback : undefined,
      "login",
    );
  }

  /**
   * Issue tokens after identity is verified (magic link, etc.).
   * Skips password checks; still enforces MFA, lockout, and active status.
   */
  async authenticateVerifiedUser(
    userId: string,
    clientContext?: ClientContext,
    mfaCode?: { totp_code?: string; backup_code?: string; sms_code?: string },
    options?: { method?: "magic_link" | "login" | "saml" | "oidc" },
  ): Promise<LoginResult> {
    const user = await UserModel.findOne({
      _id: userId,
      is_deleted: false,
    })
      .select("+password_hash +mfa.totp_secret_enc")
      .lean<IUser | null>();

    if (!user || user.status !== "active") {
      logAuthTokenOperation("login_failed", {
        reason: "invalid_credentials",
        user_id: userId,
        method: options?.method,
      });
      throw new InvalidCredentialsError();
    }

    if (await this.lockout.isLocked(userId)) {
      const retryAfterSec = await this.lockout.getLockedRemainingSec(userId);
      logAuthTokenOperation("login_failed", {
        reason: "account_locked",
        user_id: userId,
        retry_after_sec: retryAfterSec,
        method: options?.method,
      });
      throw new AccountLockedError(retryAfterSec);
    }

    await this.assertMfaIfRequired(user, userId, mfaCode);

    const legacyHash = this.passwords.needsPasswordUpgrade(user.password_hash);
    const passwordChangeRequired =
      user.password_change_required || legacyHash;

    return this.finalizeSuccessfulLogin(
      user,
      userId,
      clientContext,
      passwordChangeRequired,
      undefined,
      options?.method ?? "login",
    );
  }

  private async assertMfaIfRequired(
    user: IUser,
    userId: string,
    mfaCode?: { totp_code?: string; backup_code?: string; sms_code?: string },
  ): Promise<void> {
    if (!user.mfa_enabled) {
      return;
    }

    const smsCode = mfaCode?.sms_code;
    const totpOrBackup = mfaCode?.totp_code ?? mfaCode?.backup_code;
    if (!smsCode && !totpOrBackup) {
      logAuthTokenOperation("login_failed", {
        reason: "mfa_required",
        user_id: userId,
      });
      throw new MfaRequiredError();
    }

    let mfaOk = false;
    if (smsCode && user.mfa?.sms_enabled) {
      mfaOk = await this.smsMfa.verifySMSCode(userId, smsCode);
    } else if (totpOrBackup) {
      mfaOk = await this.mfa.verifyLoginMfa(user, totpOrBackup);
    }

    if (!mfaOk) {
      const lockResult = await this.lockout.recordFailedAttempt(userId);
      logAuthTokenOperation("login_failed", {
        reason: "invalid_mfa",
        user_id: userId,
        failed_attempts: lockResult.attempts,
      });
      if (lockResult.locked) {
        throw new AccountLockedError(lockResult.duration);
      }
      throw new InvalidMfaTokenError();
    }
  }

  private async finalizeSuccessfulLogin(
    user: IUser,
    userId: string,
    clientContext: ClientContext | undefined,
    passwordChangeRequired: boolean,
    passwordFeedback: PasswordValidationFeedback | undefined,
    method: "login" | "magic_link" | "saml" | "oidc",
  ): Promise<LoginResult> {
    await this.lockout.clearLockout(userId);
    logAuthTokenOperation("lockout_cleared", { user_id: userId });

    const sessionId = randomUUID();
    const tokens = this.jwt.generateTokens(user, sessionId);
    await this.refreshStore.register(userId, tokens.refreshJti);
    await this.sessions.createSession(
      sessionId,
      userId,
      String(user.org_id),
      tokens.refreshJti,
      clientContext ?? defaultClientContext(),
    );

    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: {
          last_login: new Date(),
          password_change_required: passwordChangeRequired,
        },
      },
    );

    logAuthTokenOperation("login_success", {
      user_id: String(user._id),
      org_id: String(user.org_id),
      refresh_jti: tokens.refreshJti,
      session_id: sessionId,
      password_change_required: passwordChangeRequired,
      method,
    });

    return {
      ...toPublicTokens(tokens),
      passwordChangeRequired,
      ...(passwordFeedback ? { passwordFeedback } : {}),
    };
  }

  /**
   * Rotate JWT pair: consume current refresh JTI, issue new tokens, register new JTI.
   * Reuse of a consumed token invalidates all refresh tokens for the user.
   */
  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    if (await this.tokenBlacklist.isBlacklisted(refreshToken)) {
      logAuthTokenOperation("refresh_failed", { reason: "blacklisted" });
      throw new UnauthorizedError();
    }

    let claims;
    try {
      claims = this.jwt.verifyRefreshToken(refreshToken);
    } catch {
      logAuthTokenOperation("refresh_failed", { reason: "invalid_jwt" });
      throw new InvalidRefreshTokenError();
    }

    const issuedAt =
      typeof claims.iat === "number"
        ? claims.iat
        : Math.floor(Date.now() / 1000);
    if (await this.tokenBlacklist.isUserRevoked(claims.sub, issuedAt)) {
      logAuthTokenOperation("refresh_failed", {
        reason: "user_revoked",
        user_id: claims.sub,
      });
      throw new UnauthorizedError();
    }

    const consumeResult = await this.refreshStore.consume(
      claims.sub,
      claims.jti,
    );

    if (consumeResult === "already_consumed") {
      logAuthTokenOperation("refresh_failed", {
        reason: "concurrent_duplicate",
        user_id: claims.sub,
        jti: claims.jti,
      });
      throw new InvalidRefreshTokenError();
    }

    if (consumeResult === "reuse") {
      const revoked = await this.refreshStore.invalidateAllUserTokens(claims.sub);
      await this.sessions.revokeAllForUser(claims.sub);
      await this.tokenReuseAlert.alertReuse({
        userId: claims.sub,
        orgId: claims.org_id,
        jti: claims.jti,
      });
      logAuthTokenOperation("refresh_reuse_detected", {
        user_id: claims.sub,
        org_id: claims.org_id,
        jti: claims.jti,
      });
      logAuthTokenOperation("tokens_invalidated", {
        user_id: claims.sub,
        org_id: claims.org_id,
        reason: "reuse",
        keys_removed: revoked,
      });
      throw new TokenReuseError();
    }

    if (consumeResult === "unknown") {
      logAuthTokenOperation("refresh_failed", {
        reason: "unknown_or_expired",
        user_id: claims.sub,
        jti: claims.jti,
      });
      throw new InvalidRefreshTokenError();
    }

    const user = await UserModel.findOne({
      _id: claims.sub,
      org_id: claims.org_id,
      is_deleted: false,
    }).lean<IUser | null>();

    if (!user || user.status !== "active") {
      logAuthTokenOperation("refresh_failed", {
        reason: "user_inactive",
        user_id: claims.sub,
      });
      throw new InvalidRefreshTokenError();
    }

    const tokens = this.jwt.generateTokens(user, claims.sid);
    await this.refreshStore.register(claims.sub, tokens.refreshJti);
    await this.sessions.rotateRefreshJti(
      claims.sid,
      claims.sub,
      claims.jti,
      tokens.refreshJti,
    );

    logAuthTokenOperation("refresh_success", {
      user_id: claims.sub,
      org_id: claims.org_id,
      previous_jti: claims.jti,
      refresh_jti: tokens.refreshJti,
      session_id: claims.sid,
    });

    return toPublicTokens(tokens);
  }

  /** @deprecated Use `refreshTokens` — kept as alias for internal callers. */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    return this.refreshTokens(refreshToken);
  }

  /** Blacklist access (and optional refresh) tokens on logout. */
  async logout(accessToken: string, refreshToken?: string): Promise<void> {
    await this.tokenBlacklist.blacklistToken(accessToken);
    try {
      const accessClaims = this.jwt.verifyAccessToken(accessToken);
      if (accessClaims.sid) {
        await this.sessions.revokeSession(accessClaims.sid, accessClaims.sub);
      }
    } catch {
      // Access token may be expired — still blacklisted above.
    }
    if (refreshToken) {
      await this.tokenBlacklist.blacklistToken(refreshToken);
      try {
        const claims = this.jwt.verifyRefreshToken(refreshToken);
        await this.refreshStore.consume(claims.sub, claims.jti);
        if (claims.sid) {
          await this.sessions.revokeSession(claims.sid, claims.sub);
        }
      } catch {
        // Refresh may already be consumed or invalid — access token is still blacklisted.
      }
    }
    logAuthTokenOperation("logout_success", {
      refresh_token_supplied: refreshToken !== undefined,
    });
  }

  /** Revoke all tokens after password change (no role check). */
  async revokeAllUserTokensOnPasswordChange(userId: string): Promise<void> {
    await this.tokenBlacklist.revokeAllUserTokens(userId);
    await this.sessions.revokeAllForUser(userId);
  }

  /**
   * Immediately revoke all JWTs for a user (revocation epoch + refresh JTIs).
   * Org admins may revoke another user in the same org.
   */
  async revokeAllUserTokens(
    callerUserId: string,
    callerOrgId: string,
    callerRole: string,
    targetUserId?: string,
  ): Promise<{ user_id: string; keys_removed: number }> {
    const userId = targetUserId ?? callerUserId;

    if (userId !== callerUserId && callerRole !== "org_admin") {
      throw new ForbiddenRevokeError();
    }

    if (userId !== callerUserId) {
      const target = await UserModel.findOne({
        _id: userId,
        org_id: callerOrgId,
        is_deleted: false,
      }).lean<IUser | null>();
      if (!target) {
        throw new UserNotInOrgError();
      }
    }

    const keysRemoved = await this.tokenBlacklist.revokeAllUserTokens(userId);
    await this.sessions.revokeAllForUser(userId);
    return { user_id: userId, keys_removed: keysRemoved };
  }

  async listMySessions(
    userId: string,
    currentSessionId?: string,
  ) {
    return this.sessions.listSessions(userId, currentSessionId);
  }

  async revokeMySession(userId: string, sessionId: string): Promise<void> {
    try {
      await this.sessions.revokeSession(sessionId, userId);
    } catch (e) {
      if (e instanceof SessionNotFoundError) {
        throw e;
      }
      throw e;
    }
  }

  async revokeAllMySessions(userId: string): Promise<{ sessions_revoked: number }> {
    const sessionsRevoked = await this.sessions.revokeAllForUser(userId);
    await this.refreshStore.invalidateAllUserTokens(userId);
    await this.tokenBlacklist.revokeAllUserTokens(userId);
    return { sessions_revoked: sessionsRevoked };
  }

  /** Send SMS code after password check (pre-login MFA challenge). */
  async sendLoginSmsCode(
    email: string,
    password: string,
    orgIdHint?: string,
  ): Promise<void> {
    const users = await this.findActiveUsersByEmail(email, orgIdHint);
    if (users.length !== 1) {
      throw new InvalidCredentialsError();
    }
    const user = users[0];
    const passwordOk = await this.passwords.verifyPassword(
      password,
      user.password_hash,
    );
    if (!passwordOk || user.status !== "active") {
      throw new InvalidCredentialsError();
    }
    if (!user.mfa?.sms_enabled || !user.phone_number) {
      throw new InvalidCredentialsError();
    }
    await this.smsMfa.sendSMSCode(String(user._id), user.phone_number);
  }

  private async findActiveUsersByEmail(
    email: string,
    orgIdHint?: string,
  ): Promise<IUser[]> {
    const filter: Record<string, unknown> = {
      email: email.toLowerCase(),
      is_deleted: false,
    };
    if (orgIdHint) {
      filter.org_id = orgIdHint;
    }
    return UserModel.find(filter)
      .select("+password_hash +mfa.totp_secret_enc")
      .lean<IUser[]>();
  }
}

function toPublicTokens(pair: AuthTokenPair): AuthTokens {
  const { refreshJti: _rj, sessionId: _sid, ...tokens } = pair;
  return tokens;
}

function defaultClientContext(): ClientContext {
  return {
    ip_address: "0.0.0.0",
    device: { type: "unknown", os: "Unknown", browser: "Unknown" },
    location: { country: "Unknown", city: "Unknown" },
  };
}

