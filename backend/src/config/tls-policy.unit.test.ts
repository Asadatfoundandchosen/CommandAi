import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  assertOpenSearchHttps,
  assertRedisUrlTls,
  mongooseTlsOptions,
  normalizeTimescaleConnectionString,
} from "./tls-policy.js";

describe("tls-policy", () => {
  it("requires rediss in production", () => {
    assert.throws(
      () => assertRedisUrlTls("production", "redis://host:6379"),
      /rediss/,
    );
    assert.doesNotThrow(() =>
      assertRedisUrlTls("production", "rediss://host:6379"),
    );
  });

  it("enables mongoose TLS in production for remote URIs", () => {
    assert.deepEqual(
      mongooseTlsOptions("production", "mongodb+srv://cluster/app"),
      { tls: true },
    );
    assert.deepEqual(
      mongooseTlsOptions("development", "mongodb://127.0.0.1:27017/db"),
      {},
    );
  });

  it("requires sslmode=require for Timescale in staging", () => {
    assert.throws(
      () =>
        normalizeTimescaleConnectionString(
          "staging",
          "postgresql://u:p@host:5432/metrics",
        ),
      /sslmode/,
    );
    const url = normalizeTimescaleConnectionString(
      "staging",
      "postgresql://u:p@host:5432/metrics?sslmode=require",
    );
    assert.match(url, /sslmode=require/);
  });

  it("rejects http OpenSearch node in production", () => {
    assert.throws(
      () => assertOpenSearchHttps("production", "http://vpc.example.com"),
      /https/,
    );
  });
});
