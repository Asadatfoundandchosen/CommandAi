import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import jwt from "jsonwebtoken";

import { config } from "@config/index.js";
import {
  clearSharedRedis,
  getOrCreateRedis,
} from "../../infrastructure/cache/redis-client.js";

import { TokenBlacklistService } from "./token-blacklist.service.js";

const runIntegration = process.env.RUN_REDIS_INTEGRATION_TESTS === "1";

test(
  "AC: Redis MGET blacklist check completes within 5ms",
  { skip: !runIntegration },
  async () => {
    clearSharedRedis();
    getOrCreateRedis(config.redis);
    const blacklist = new TokenBlacklistService(
      { invalidateAllUserTokens: async () => 0 } as never,
    );
    const token = jwt.sign(
      {
        sub: "507f1f77bcf86cd799439011",
        org_id: "507f191e810c19729de860ea",
        type: "access",
        exp: Math.floor(Date.now() / 1000) + 900,
      },
      config.jwt.accessSecret,
    );

    const iterations = 50;
    const start = performance.now();
    for (let i = 0; i < iterations; i += 1) {
      await blacklist.checkRevoked(token, "507f1f77bcf86cd799439011", 0);
    }
    const perCheckMs = (performance.now() - start) / iterations;
    assert.ok(
      perCheckMs < 5,
      `Redis checkRevoked averaged ${perCheckMs.toFixed(2)}ms (target < 5ms)`,
    );
  },
);
