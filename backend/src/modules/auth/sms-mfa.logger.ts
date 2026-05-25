/** Audit log for SMS MFA sends (no message body or code values). */
export type SmsMfaLogEvent = "sms_mfa_sent" | "sms_mfa_send_failed" | "sms_mfa_verified";

export function logSmsMfaOperation(
  event: SmsMfaLogEvent,
  fields: Record<string, string | number | boolean | undefined>,
): void {
  const level = event === "sms_mfa_send_failed" ? "warn" : "info";
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
