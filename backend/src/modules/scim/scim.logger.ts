export type ScimLogEvent =
  | "scim_user_list"
  | "scim_user_create"
  | "scim_user_update"
  | "scim_user_deactivate"
  | "scim_user_get"
  | "scim_group_list"
  | "scim_group_create"
  | "scim_group_update"
  | "scim_group_delete"
  | "scim_group_get"
  | "scim_auth_failed";

export function logScimOperation(
  event: ScimLogEvent,
  fields: Record<string, string | number | boolean | undefined>,
): void {
  const level = event === "scim_auth_failed" ? "warn" : "info";
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
