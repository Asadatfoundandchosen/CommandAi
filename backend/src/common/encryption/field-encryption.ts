import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

import { config } from "@config/index.js";

const ALGORITHM = "aes-256-gcm" as const;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const LEGACY_PREFIX = "v1";

function primaryKey(): Buffer {
  return Buffer.from(config.encryption.key, "hex");
}

function legacyKey(): Buffer {
  const raw = config.encryption.legacyKey;
  return Buffer.from(raw, "utf8").subarray(0, 32);
}

/** True if the value looks like an encrypted blob (not plaintext). */
export function isEncryptedField(value: string): boolean {
  if (value.startsWith(`${LEGACY_PREFIX}:`)) {
    return true;
  }
  try {
    const data = Buffer.from(value, "base64");
    return data.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}

/**
 * AES-256-GCM encrypt sensitive fields.
 * Wire format: base64( IV[12] || authTag[16] || ciphertext ).
 */
export function encryptField(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, primaryKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

function decryptLegacyV1(ciphertext: string): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 4 || parts[0] !== LEGACY_PREFIX) {
    throw new Error("Invalid encrypted field format");
  }
  const iv = Buffer.from(parts[1]!, "base64url");
  const tag = Buffer.from(parts[2]!, "base64url");
  const data = Buffer.from(parts[3]!, "base64url");
  const decipher = createDecipheriv(ALGORITHM, legacyKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}

function decryptV2(ciphertext: string): string {
  const data = Buffer.from(ciphertext, "base64");
  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted field length");
  }
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, primaryKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    "utf8",
  );
}

/** Decrypt a value produced by `encryptField` (v2) or legacy `v1:` format. */
export function decryptField(ciphertext: string): string {
  if (ciphertext.startsWith(`${LEGACY_PREFIX}:`)) {
    return decryptLegacyV1(ciphertext);
  }
  return decryptV2(ciphertext);
}

/**
 * Deterministic HMAC token for equality search on encrypted fields (e.g. phone, SSN).
 * Store alongside ciphertext; never expose the token in API responses.
 */
export function searchableFieldToken(
  plaintext: string,
  purpose: string,
): string {
  return createHmac("sha256", config.encryption.searchKey)
    .update(`${purpose}\0${plaintext}`, "utf8")
    .digest("hex");
}
