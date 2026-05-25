import assert from "node:assert/strict";
import { test } from "node:test";

import { decryptField, encryptField } from "@common/encryption/field-encryption.js";

test("encryptField round-trips TOTP secrets", () => {
  const secret = "JBSWY3DPEHPK3PXP";
  const enc = encryptField(secret);
  assert.notEqual(enc, secret);
  assert.equal(decryptField(enc), secret);
});

test("decryptField rejects tampered v2 ciphertext", () => {
  const enc = encryptField("test-secret-value-32chars!!");
  const buf = Buffer.from(enc, "base64");
  buf[buf.length - 1] ^= 0xff;
  assert.throws(() => decryptField(buf.toString("base64")));
});
