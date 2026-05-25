import assert from "node:assert/strict";
import { test } from "node:test";

import { sanitizeAuditSnapshot } from "./audit-sanitize.js";

test("sanitizeAuditSnapshot redacts password and key hashes", () => {
  const out = sanitizeAuditSnapshot({
    email: "user@example.com",
    password_hash: "secret",
    key_hash: "abc",
  });
  assert.equal(out?.email, "user@example.com");
  assert.equal(out?.password_hash, "[REDACTED]");
  assert.equal(out?.key_hash, "[REDACTED]");
});

test("sanitizeAuditSnapshot redacts *_enc nested fields", () => {
  const out = sanitizeAuditSnapshot({
    oidc: { client_secret_enc: "cipher" },
  });
  assert.deepEqual(out?.oidc, { client_secret_enc: "[REDACTED]" });
});
