import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SALT_LEN = 16;
const KEY_LEN = 64;

/** Scrypt-based password storage (`saltHex:keyHex`). */
export function hashPassword(plain: string): string {
  const salt = randomBytes(SALT_LEN);
  const key = scryptSync(plain, salt, KEY_LEN);
  return `${salt.toString("hex")}:${key.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 2) {
    return false;
  }
  const [saltHex, keyHex] = parts;
  const salt = Buffer.from(saltHex, "hex");
  const expectedKey = Buffer.from(keyHex, "hex");
  const key = scryptSync(plain, salt, KEY_LEN);
  if (key.length !== expectedKey.length) {
    return false;
  }
  return timingSafeEqual(key, expectedKey);
}
