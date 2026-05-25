export { UnauthorizedError } from "./auth.errors.js";
export {
  LockoutService,
  LOCKOUT_DURATIONS,
  MAX_FAILED_ATTEMPTS_BEFORE_LOCK,
  lockoutAttemptsKey,
  lockedKey,
} from "./lockout.service.js";
export { LockoutAlertService } from "./lockout-alert.service.js";
export { recordAccountLockout } from "./auth-metrics.js";
export { AccountLockedError } from "./auth.service.js";
export {
  PasswordService,
  WeakPasswordError,
  MIN_PASSWORD_STRENGTH_SCORE,
  type PasswordValidationResult,
  type PasswordValidationFeedback,
} from "./password.service.js";
export type { LoginResult } from "./auth.service.js";
export {
  AuthService,
  TokenReuseError,
  ForbiddenRevokeError,
  UserNotInOrgError,
} from "./auth.service.js";
export {
  TokenBlacklistService,
  blacklistKey,
  tokenTtlSeconds,
  userRevokedKey,
  BLACKLIST_KEY_PREFIX,
  USER_REVOKED_KEY_PREFIX,
} from "./token-blacklist.service.js";
export type {
  AuthSessionView,
  ClientContext,
  IAuthSession,
  SessionDevice,
  SessionLocation,
} from "./auth-session.types.js";
export {
  AuthSessionService,
  authSessionKey,
  authSessionsUserKey,
  SessionNotFoundError,
} from "./auth-session.service.js";
export { extractClientContext, parseUserAgent } from "./client-context.js";
export {
  MfaService,
  InvalidMfaTokenError,
  TOTP_ISSUER,
  TOTP_WINDOW,
} from "./mfa.service.js";
export {
  BackupCodesService,
  BACKUP_CODE_COUNT,
  BACKUP_CODE_LOW_WARNING_THRESHOLD,
  buildBackupCodeStatus,
  type BackupCodeStatus,
} from "./backup-codes.service.js";
export {
  SmsMfaService,
  InvalidSmsCodeError,
  SmsRateLimitError,
  generateSecureCode,
  SMS_CODE_TTL_SEC,
} from "./sms-mfa.service.js";
export { validatePhoneNumber } from "./phone.validation.js";
export { MfaRequiredError } from "./auth.service.js";
export { AuthController } from "./auth.controller.js";
export { createAuthRouter } from "./auth.routes.js";
export { logAuthTokenOperation } from "./auth-token.logger.js";
export { registerAuthMetrics, recordRefreshTokenReuse } from "./auth-metrics.js";
export { TokenReuseAlertService } from "./token-reuse-alert.service.js";
export {
  JwtService,
  type TokenPayload,
  type RefreshTokenClaims,
  type AuthTokenPair,
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_SEC,
} from "./jwt.service.js";
export {
  RefreshTokenStore,
  refreshTokenKey,
  refreshTokenUsedKey,
  refreshTokenConcurrentKey,
  REFRESH_KEY_PREFIX,
  REFRESH_USED_KEY_PREFIX,
  REFRESH_CONCURRENT_PREFIX,
  REFRESH_CONCURRENT_GRACE_SEC,
} from "./refresh-token.store.js";
export const authModule = "auth" as const;
