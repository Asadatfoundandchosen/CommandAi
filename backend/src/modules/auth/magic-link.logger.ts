/** Structured magic-link auth logs (no tokens or full links). */
export function logMagicLinkOperation(
  operation: string,
  fields: Record<string, unknown>,
): void {
  const payload = {
    ts: new Date().toISOString(),
    service: "auth",
    component: "magic_link",
    operation,
    ...fields,
  };
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
