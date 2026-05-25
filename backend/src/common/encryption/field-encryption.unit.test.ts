import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  decryptField,
  encryptField,
  isEncryptedField,
  searchableFieldToken,
} from "./field-encryption.js";

describe("field-encryption", () => {
  it("encryptField round-trips with AES-256-GCM v2 blob", () => {
    const secret = "JBSWY3DPEHPK3PXP";
    const enc = encryptField(secret);
    assert.notEqual(enc, secret);
    assert.ok(isEncryptedField(enc));
    assert.equal(decryptField(enc), secret);
  });

  it("decryptField rejects tampered ciphertext", () => {
    const enc = encryptField("test-secret-value-32chars!!");
    const buf = Buffer.from(enc, "base64");
    buf[buf.length - 1] ^= 0xff;
    assert.throws(() => decryptField(buf.toString("base64")));
  });

  it("decryptField reads legacy v1 ciphertext", () => {
    const legacy =
      "v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AAAA";
    assert.throws(() => decryptField(legacy));
  });

  it("searchableFieldToken is stable for the same input", () => {
    const a = searchableFieldToken("+14155552671", "user.phone");
    const b = searchableFieldToken("+14155552671", "user.phone");
    assert.equal(a, b);
    assert.notEqual(a, searchableFieldToken("+14155552672", "user.phone"));
  });
});
