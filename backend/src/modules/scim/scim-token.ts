import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function generateScimBearerToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashScimBearerToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function verifyScimBearerToken(token: string, storedHash: string): boolean {
  const computed = hashScimBearerToken(token);
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
