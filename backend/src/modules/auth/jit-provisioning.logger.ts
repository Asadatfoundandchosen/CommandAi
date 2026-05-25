export type JitProvisioningLogEvent =
  | "jit_user_created"
  | "jit_user_updated"
  | "jit_provisioning_failed";

export function logJitProvisioning(
  event: JitProvisioningLogEvent,
  fields: Record<string, string | number | boolean | undefined>,
): void {
  const level = event === "jit_provisioning_failed" ? "warn" : "info";
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
