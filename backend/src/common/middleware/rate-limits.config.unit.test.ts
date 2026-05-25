import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  EXPENSIVE_PATH_PREFIXES,
  RATE_LIMITS,
  isExpensiveEndpoint,
  resolveRateLimitTiers,
} from "./rate-limits.config.js";

describe("rate-limits.config", () => {
  test("RATE_LIMITS matches story defaults", () => {
    assert.equal(RATE_LIMITS.default.window, 60);
    assert.equal(RATE_LIMITS.default.max, 100);
    assert.equal(RATE_LIMITS.tenant.window, 60);
    assert.equal(RATE_LIMITS.tenant.max, 1000);
    assert.equal(RATE_LIMITS.expensive.window, 60);
    assert.equal(RATE_LIMITS.expensive.max, 10);
  });

  test("isExpensiveEndpoint flags search and export paths", () => {
    assert.equal(isExpensiveEndpoint("/api/search"), true);
    assert.equal(isExpensiveEndpoint("/api/search?q=foo"), true);
    assert.equal(isExpensiveEndpoint("/api/v1/credits/transactions/export"), true);
    assert.equal(isExpensiveEndpoint("/api/v1/roles"), false);
  });

  test("resolveRateLimitTiers lowers endpoint cap for expensive paths", () => {
    const normal = resolveRateLimitTiers("/api/v1/users");
    const heavy = resolveRateLimitTiers("/api/files/presign-upload");
    assert.ok(normal.endpoint.max >= heavy.endpoint.max);
    assert.equal(heavy.endpoint.max, RATE_LIMITS.expensive.max);
  });

  test("EXPENSIVE_PATH_PREFIXES is non-empty", () => {
    assert.ok(EXPENSIVE_PATH_PREFIXES.length > 0);
  });
});
