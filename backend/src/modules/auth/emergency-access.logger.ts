export type EmergencyAccessLogEvent =
  | "emergency_access_granted"
  | "emergency_access_revoked"
  | "emergency_access_login";

export function logEmergencyAccess(
  event: EmergencyAccessLogEvent,
  fields: Record<string, string | number | boolean | undefined>,
): void {
  const level = event === "emergency_access_login" ? "warn" : "info";
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
