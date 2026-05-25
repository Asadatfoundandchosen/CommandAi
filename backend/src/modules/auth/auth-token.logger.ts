/** Structured auth token operation log (Loki / JSON pipeline). */
export type AuthTokenLogEvent =
  | "login_success"
  | "login_failed"
  | "refresh_success"
  | "refresh_failed"
  | "refresh_reuse_detected"
  | "tokens_invalidated"
  | "refresh_concurrent_rejected"
  | "token_blacklisted"
  | "user_tokens_revoked"
  | "logout_success"
  | "account_locked"
  | "lockout_cleared"
  | "saml_login_redirect"
  | "saml_login_success"
  | "saml_login_failed"
  | "oidc_login_redirect"
  | "oidc_login_success"
  | "oidc_login_failed";

export function logAuthTokenOperation(
  event: AuthTokenLogEvent,
  fields: Record<string, string | number | boolean | undefined>,
): void {
  const level =
    event === "refresh_reuse_detected" ||
      event === "login_failed" ||
      event === "saml_login_failed" ||
      event === "oidc_login_failed" ||
      event === "account_locked"
      ? "warn"
      : "info";
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "api",
    message: event,
    ...fields,
  });
  const out = level === "warn" ? process.stderr : process.stdout;
  out.write(`${line}\n`);
}
