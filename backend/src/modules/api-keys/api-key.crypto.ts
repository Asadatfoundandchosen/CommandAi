import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const API_KEY_PREFIX = "1cmd_";
export const API_KEY_PREFIX_DISPLAY_LEN = 12;

export function generateApiKeySecret(): string {
  return `${API_KEY_PREFIX}${randomBytes(32).toString("hex")}`;
}

export function apiKeyDisplayPrefix(fullKey: string): string {
  return fullKey.slice(0, API_KEY_PREFIX_DISPLAY_LEN);
}

export function hashApiKey(fullKey: string): string {
  return createHash("sha256").update(fullKey, "utf8").digest("hex");
}

export function verifyApiKeyHash(fullKey: string, storedHash: string): boolean {
  const computed = hashApiKey(fullKey);
  try {
    const a = Buffer.from(computed, "hex");
    const b = Buffer.from(storedHash, "hex");
    if (a.length !== b.length) {
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** Accept `X-API-Key` or `Authorization: Bearer 1cmd_…`. */
export function extractApiKeyFromRequest(
  headers: Record<string, string | string[] | undefined>,
): string | null {
  const header = headers["x-api-key"] ?? headers["X-API-Key"];
  if (typeof header === "string" && header.startsWith(API_KEY_PREFIX)) {
    return header.trim();
  }

  const auth = headers.authorization ?? headers.Authorization;
  if (typeof auth === "string") {
    const match = /^Bearer\s+(\S+)/i.exec(auth);
    const token = match?.[1];
    if (token?.startsWith(API_KEY_PREFIX)) {
      return token;
    }
  }

  return null;
}
