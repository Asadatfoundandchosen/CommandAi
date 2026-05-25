import assert from "node:assert/strict";
import { test } from "node:test";
import { Redis } from "ioredis";

import { config } from "@config/index.js";
import {
  getOrCreateRedis,
  clearSharedRedis,
} from "../../infrastructure/cache/redis-client.js";

import { RefreshTokenStore } from "./refresh-token.store.js";

const redisUrl = process.env.REDIS_URL;
const runIntegration = process.env.RUN_REDIS_INTEGRATION_TESTS === "1";

test("atomic consume: only one concurrent refresh wins", { skip: !runIntegration || !redisUrl }, async () => {
  clearSharedRedis();
  getOrCreateRedis(config.redis);
  const store = new RefreshTokenStore();
  const userId = "507f1f77bcf86cd799439011";
  const jti = `concurrent-${Date.now()}`;

  await store.register(userId, jti);

  const [first, second] = await Promise.all([
    store.consume(userId, jti),
    store.consume(userId, jti),
  ]);

  const results = new Set([first, second]);
  assert.ok(results.has("consumed"));
  assert.ok(results.has("already_consumed"));
  assert.equal(results.has("reuse"), false);

  await store.invalidateAllUserTokens(userId);
  const client = new Redis(config.redis.connection);
  await client.quit();
});

test("used refresh token rejected as reuse after grace window", { skip: !runIntegration || !redisUrl }, async () => {
  clearSharedRedis();
  getOrCreateRedis(config.redis);
  const store = new RefreshTokenStore();
  const userId = "507f1f77bcf86cd799439012";
  const jti = `reuse-${Date.now()}`;

  await store.register(userId, jti);
  assert.equal(await store.consume(userId, jti), "consumed");

  // Simulate grace expiry: remove concurrent marker only (used remains)
  const client = new Redis(config.redis.connection);
  await client.del(`refresh:concurrent:${userId}:${jti}`);

  assert.equal(await store.consume(userId, jti), "reuse");

  const revoked = await store.invalidateAllUserTokens(userId);
  assert.ok(revoked >= 1);

  await client.quit();
});
