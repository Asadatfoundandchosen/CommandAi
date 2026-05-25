import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CONSUME_REFRESH_SCRIPT,
  REFRESH_CONCURRENT_PREFIX,
  REFRESH_KEY_PREFIX,
  REFRESH_USED_KEY_PREFIX,
  refreshTokenConcurrentKey,
  refreshTokenKey,
  refreshTokenUsedKey,
} from "./refresh-token.store.js";

test("refreshTokenKey uses refresh:userId:jti pattern", () => {
  assert.equal(
    refreshTokenKey("507f1f77bcf86cd799439011", "abc-jti"),
    `${REFRESH_KEY_PREFIX}507f1f77bcf86cd799439011:abc-jti`,
  );
});

test("refreshTokenUsedKey tracks consumed JTIs for reuse detection", () => {
  assert.equal(
    refreshTokenUsedKey("507f1f77bcf86cd799439011", "abc-jti"),
    `${REFRESH_USED_KEY_PREFIX}507f1f77bcf86cd799439011:abc-jti`,
  );
});

test("refreshTokenConcurrentKey supports concurrent-duplicate grace window", () => {
  assert.equal(
    refreshTokenConcurrentKey("507f1f77bcf86cd799439011", "abc-jti"),
    `${REFRESH_CONCURRENT_PREFIX}507f1f77bcf86cd799439011:abc-jti`,
  );
});

test("CONSUME_REFRESH_SCRIPT returns consumed, already_consumed, reuse, or unknown", () => {
  assert.match(CONSUME_REFRESH_SCRIPT, /return 'consumed'/);
  assert.match(CONSUME_REFRESH_SCRIPT, /return 'already_consumed'/);
  assert.match(CONSUME_REFRESH_SCRIPT, /return 'reuse'/);
  assert.match(CONSUME_REFRESH_SCRIPT, /return 'unknown'/);
});
