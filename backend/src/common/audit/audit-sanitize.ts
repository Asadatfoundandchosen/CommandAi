const REDACTED = "[REDACTED]";

const SENSITIVE_KEYS = new Set([
  "password_hash",
  "key_hash",
  "totp_secret_enc",
  "client_secret_enc",
  "sp_private_key_enc",
  "credentials",
  "backup_codes",
  "backup_code_hashes",
  "phone_number_enc",
  "ssn_enc",
  "mfa",
]);

function isSensitiveKey(key: string): boolean {
  if (SENSITIVE_KEYS.has(key)) {
    return true;
  }
  return key.endsWith("_enc") || key.endsWith("_hash");
}

/** Strip secrets and credentials from audit snapshots. */
export function sanitizeAuditSnapshot(
  value: unknown,
): Record<string, unknown> | undefined {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const input = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(input)) {
    if (isSensitiveKey(key)) {
      out[key] = REDACTED;
      continue;
    }
    if (val != null && typeof val === "object" && !Array.isArray(val) && !(val instanceof Date)) {
      const nested = sanitizeAuditSnapshot(val);
      if (nested !== undefined) {
        out[key] = nested;
      }
      continue;
    }
    out[key] = val;
  }
  return out;
}
