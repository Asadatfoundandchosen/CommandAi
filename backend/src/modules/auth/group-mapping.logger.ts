export type GroupMappingLogEvent = "sso_role_changed" | "sso_group_sync_skipped";

export function logGroupMappingEvent(
  event: GroupMappingLogEvent,
  fields: Record<string, string | number | boolean | undefined>,
): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "info",
    service: "api",
    message: event,
    reason: "sso_group_sync",
    ...fields,
  });
  process.stdout.write(`${line}\n`);
}
