/** Canonical audit action names for authentication and session events. */
export const AUTH_EVENTS = {
  LOGIN_SUCCESS: "auth.login.success",
  LOGIN_FAILED: "auth.login.failed",
  LOGOUT: "auth.logout",
  MFA_ENABLED: "auth.mfa.enabled",
  MFA_VERIFIED: "auth.mfa.verified",
  MFA_DISABLED: "auth.mfa.disabled",
  PASSWORD_CHANGED: "auth.password.changed",
  PASSWORD_RESET: "auth.password.reset",
  SESSION_REVOKED: "auth.session.revoked",
} as const;

export type AuthEventType = (typeof AUTH_EVENTS)[keyof typeof AUTH_EVENTS];
