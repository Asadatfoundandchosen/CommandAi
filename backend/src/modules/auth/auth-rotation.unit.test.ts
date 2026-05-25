import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import jwt from "jsonwebtoken";

import { config } from "@config/index.js";
import type { IUser } from "@modules/user/user.model.js";
import mongoose from "mongoose";

import { logAuthTokenOperation } from "./auth-token.logger.js";
import {
  InvalidRefreshTokenError,
  TokenReuseError,
} from "./auth.service.js";
import { JwtService } from "./jwt.service.js";
import type { RefreshConsumeResult } from "./refresh-token.store.js";
import {
  REFRESH_CONCURRENT_PREFIX,
  REFRESH_KEY_PREFIX,
  REFRESH_USED_KEY_PREFIX,
  refreshTokenConcurrentKey,
  refreshTokenKey,
  refreshTokenUsedKey,
} from "./refresh-token.store.js";

const userId = new mongoose.Types.ObjectId();
const orgId = new mongoose.Types.ObjectId();
const accountId = new mongoose.Types.ObjectId();
const deptId = new mongoose.Types.ObjectId();
const now = new Date();

const mockUser: IUser = {
  _id: userId,
  org_id: orgId,
  account_id: accountId,
  department_id: deptId,
  email: "admin@example.com",
  password_hash: "ignored",
  first_name: "Test",
  last_name: "User",
  role: "org_admin",
  status: "active",
  mfa_enabled: false,
  password_change_required: false,
  last_login: null,
  created_by: userId,
  created_at: now,
  updated_by: userId,
  updated_at: now,
  is_deleted: false,
};

const jwtService = new JwtService();

test("new refresh token has a new jti on each generateTokens call", () => {
  const first = jwtService.generateTokens(mockUser, randomUUID());
  const second = jwtService.generateTokens(mockUser, randomUUID());
  assert.notEqual(first.refreshJti, second.refreshJti);

  const a = jwt.decode(first.refreshToken) as jwt.JwtPayload;
  const b = jwt.decode(second.refreshToken) as jwt.JwtPayload;
  assert.notEqual(a.jti, b.jti);
});

test("used refresh token is classified as reuse after consume grace expires", async () => {
  const store = new InMemoryRefreshTokenStore();
  const user = String(userId);
  const jti = "jti-used-test";

  await store.register(user, jti);
  assert.equal(await store.consume(user, jti), "consumed");
  store.clearConcurrentGrace(user, jti);
  assert.equal(await store.consume(user, jti), "reuse");
});

test("concurrent duplicate refresh returns already_consumed not reuse (in-memory store)", async () => {
  const store = new InMemoryRefreshTokenStore();
  const user = String(userId);
  const jti = "jti-concurrent-test";

  await store.register(user, jti);
  const [a, b] = await Promise.all([
    store.consume(user, jti),
    store.consume(user, jti),
  ]);

  const outcomes = new Set([a, b]);
  assert.ok(outcomes.has("consumed"));
  assert.ok(outcomes.has("already_consumed"));
  assert.equal(outcomes.has("reuse"), false);
});

test("logAuthTokenOperation emits structured JSON for token operations", () => {
  const lines: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;

  logAuthTokenOperation("refresh_success", {
    user_id: "u1",
    org_id: "o1",
    refresh_jti: "jti-1",
  });

  process.stdout.write = orig;
  const parsed = JSON.parse(lines[0].trim()) as Record<string, unknown>;
  assert.equal(parsed.message, "refresh_success");
  assert.equal(parsed.user_id, "u1");
  assert.equal(parsed.service, "api");
});

test("refresh token key helpers match Redis layout", () => {
  assert.equal(
    refreshTokenKey("user1", "jti-a"),
    `${REFRESH_KEY_PREFIX}user1:jti-a`,
  );
  assert.equal(
    refreshTokenUsedKey("user1", "jti-a"),
    `${REFRESH_USED_KEY_PREFIX}user1:jti-a`,
  );
  assert.equal(
    refreshTokenConcurrentKey("user1", "jti-a"),
    `${REFRESH_CONCURRENT_PREFIX}user1:jti-a`,
  );
});

test("verifyRefreshToken rejects tokens without jti (legacy)", () => {
  const legacy = jwt.sign(
    { sub: String(userId), org_id: String(orgId), type: "refresh" },
    config.jwt.refreshSecret,
    { expiresIn: "7d" },
  );
  assert.throws(() => jwtService.verifyRefreshToken(legacy));
});

/** Mirrors Redis Lua consume semantics for unit tests without Redis. */
class InMemoryRefreshTokenStore {
  private active = new Map<string, string>();
  private used = new Map<string, number>();
  private concurrent = new Map<string, number>();
  private readonly ttlMs = 7 * 24 * 60 * 60 * 1000;
  private readonly graceMs = 5 * 1000;

  async register(userId: string, jti: string): Promise<void> {
    this.active.set(refreshTokenKey(userId, jti), "1");
  }

  async consume(userId: string, jti: string): Promise<RefreshConsumeResult> {
    const activeKey = refreshTokenKey(userId, jti);
    const usedKey = refreshTokenUsedKey(userId, jti);
    const concurrentKey = refreshTokenConcurrentKey(userId, jti);
    const now = Date.now();

    this.pruneExpired(now);

    if (this.active.has(activeKey)) {
      this.active.delete(activeKey);
      this.used.set(usedKey, now + this.ttlMs);
      this.concurrent.set(concurrentKey, now + this.graceMs);
      return "consumed";
    }

    if (this.concurrent.has(concurrentKey)) {
      return "already_consumed";
    }

    if (this.used.has(usedKey)) {
      return "reuse";
    }

    return "unknown";
  }

  clearConcurrentGrace(userId: string, jti: string): void {
    this.concurrent.delete(refreshTokenConcurrentKey(userId, jti));
  }

  async invalidateAllUserTokens(userId: string): Promise<number> {
    let n = 0;
    for (const map of [this.active, this.used, this.concurrent]) {
      for (const key of [...map.keys()]) {
        if (key.includes(`:${userId}:`)) {
          map.delete(key);
          n += 1;
        }
      }
    }
    return n;
  }

  private pruneExpired(now: number): void {
    for (const [k, exp] of this.used) {
      if (exp <= now) {
        this.used.delete(k);
      }
    }
    for (const [k, exp] of this.concurrent) {
      if (exp <= now) {
        this.concurrent.delete(k);
      }
    }
  }
}

test("TokenReuseError and InvalidRefreshTokenError have stable names", () => {
  assert.equal(new TokenReuseError().name, "TokenReuseError");
  assert.equal(new InvalidRefreshTokenError().name, "InvalidRefreshTokenError");
});
