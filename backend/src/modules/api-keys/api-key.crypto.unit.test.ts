import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  API_KEY_PREFIX,
  apiKeyDisplayPrefix,
  extractApiKeyFromRequest,
  generateApiKeySecret,
  hashApiKey,
  verifyApiKeyHash,
} from "./api-key.crypto.js";

describe("api-key.crypto", () => {
  test("generateApiKeySecret uses 1cmd_ prefix and unique hashes", () => {
    const a = generateApiKeySecret();
    const b = generateApiKeySecret();
    assert.ok(a.startsWith(API_KEY_PREFIX));
    assert.ok(b.startsWith(API_KEY_PREFIX));
    assert.notEqual(a, b);
    assert.notEqual(hashApiKey(a), hashApiKey(b));
  });

  test("apiKeyDisplayPrefix returns first 12 characters", () => {
    const key = generateApiKeySecret();
    assert.equal(apiKeyDisplayPrefix(key), key.slice(0, 12));
  });

  test("verifyApiKeyHash accepts valid secret only", () => {
    const key = generateApiKeySecret();
    const hash = hashApiKey(key);
    assert.equal(verifyApiKeyHash(key, hash), true);
    assert.equal(verifyApiKeyHash(`${key}x`, hash), false);
  });

  test("extractApiKeyFromRequest reads header and bearer", () => {
    const key = generateApiKeySecret();
    assert.equal(
      extractApiKeyFromRequest({ "x-api-key": key }),
      key,
    );
    assert.equal(
      extractApiKeyFromRequest({ authorization: `Bearer ${key}` }),
      key,
    );
    assert.equal(extractApiKeyFromRequest({ authorization: "Bearer jwt" }), null);
  });
});
