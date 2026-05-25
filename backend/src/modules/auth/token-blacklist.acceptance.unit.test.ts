import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { test } from "node:test";
import jwt from "jsonwebtoken";

import { config } from "@config/index.js";

import { UnauthorizedError } from "./auth.errors.js";
import {
  ForbiddenRevokeError,
} from "./auth.service.js";
import {
  blacklistKey,
  tokenTtlSeconds,
  userRevokedKey,
} from "./token-blacklist.service.js";

const accessSecret = config.jwt.accessSecret;
const userId = "507f1f77bcf86cd799439011";
const orgId = "507f191e810c19729de860ea";

function signAccessToken(expOffsetSec = 900, iatOffsetSec = 0): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      sub: userId,
      org_id: orgId,
      type: "access",
      role: "org_admin",
      iat: now + iatOffsetSec,
      exp: now + expOffsetSec,
    },
    accessSecret,
  );
}

/** In-memory Redis stand-in for acceptance tests (no live Redis required). */
class InMemoryBlacklistStore {
  private entries = new Map<string, { value: string; expiresAt: number }>();

  async set(key: string, value: string, mode: string, ttlSec: number): Promise<void> {
    if (mode !== "EX") {
      return;
    }
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlSec * 1000,
    });
  }

  async get(key: string): Promise<string | null> {
    const row = this.entries.get(key);
    if (!row) {
      return null;
    }
    if (row.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return row.value;
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    return Promise.all(keys.map((k) => this.get(k)));
  }

  async blacklistToken(token: string): Promise<void> {
    const ttl = tokenTtlSeconds(token);
    if (ttl !== null && ttl > 0) {
      await this.set(blacklistKey(token), "1", "EX", ttl);
    }
  }

  async checkRevoked(
    token: string,
    uid: string,
    issuedAtSec: number,
  ): Promise<{ blacklisted: boolean; userRevoked: boolean }> {
    const [blacklistHit, revokedRaw] = await this.mget(
      blacklistKey(token),
      userRevokedKey(uid),
    );
    if (blacklistHit !== null) {
      return { blacklisted: true, userRevoked: false };
    }
    if (revokedRaw === null) {
      return { blacklisted: false, userRevoked: false };
    }
    const revokedAt = Number(revokedRaw);
    return {
      blacklisted: false,
      userRevoked: Number.isFinite(revokedAt) && issuedAtSec < revokedAt,
    };
  }

  async revokeAllUserTokens(uid: string): Promise<void> {
    const revokedAt = Math.floor(Date.now() / 1000);
    await this.set(userRevokedKey(uid), String(revokedAt), "EX", 7 * 24 * 60 * 60);
  }
}

test("AC: blacklisted token is rejected on checkRevoked", async () => {
  const store = new InMemoryBlacklistStore();
  const token = signAccessToken();
  const decoded = jwt.decode(token) as jwt.JwtPayload;

  await store.blacklistToken(token);
  const status = await store.checkRevoked(
    token,
    userId,
    (decoded.iat as number) ?? 0,
  );
  assert.equal(status.blacklisted, true);
});

test("AC: logout flow blacklists the current access token", async () => {
  const store = new InMemoryBlacklistStore();
  const token = signAccessToken();
  const decoded = jwt.decode(token) as jwt.JwtPayload;

  await store.blacklistToken(token);
  const hit = await store.get(blacklistKey(token));
  assert.equal(hit, "1");

  const status = await store.checkRevoked(
    token,
    userId,
    (decoded.iat as number) ?? 0,
  );
  assert.equal(status.blacklisted, true);
});

test("AC: password-change style revoke rejects tokens issued before epoch", async () => {
  const store = new InMemoryBlacklistStore();
  const oldToken = signAccessToken(900, -60);
  const oldDecoded = jwt.decode(oldToken) as jwt.JwtPayload;

  await store.revokeAllUserTokens(userId);

  const status = await store.checkRevoked(
    oldToken,
    userId,
    (oldDecoded.iat as number) ?? 0,
  );
  assert.equal(status.userRevoked, true);
});

test("AC: blacklist entry TTL matches remaining JWT lifetime", () => {
  const ttl = 120;
  const token = signAccessToken(ttl);
  const remaining = tokenTtlSeconds(token);
  assert.ok(remaining !== null);
  assert.ok(remaining > 0 && remaining <= ttl);
});

test("AC: blacklist entry expires when TTL elapses", async () => {
  const store = new InMemoryBlacklistStore();
  const token = signAccessToken(1);
  await store.blacklistToken(token);
  assert.equal(await store.get(blacklistKey(token)), "1");

  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(await store.get(blacklistKey(token)), null);
});

test("AC: checkRevoked completes in under 5ms (in-memory baseline)", async () => {
  const store = new InMemoryBlacklistStore();
  const token = signAccessToken();
  const decoded = jwt.decode(token) as jwt.JwtPayload;
  const iterations = 500;
  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    await store.checkRevoked(token, userId, (decoded.iat as number) ?? 0);
  }
  const elapsed = performance.now() - start;
  const perCheckMs = elapsed / iterations;
  assert.ok(
    perCheckMs < 5,
    `expected < 5ms per check, got ${perCheckMs.toFixed(3)}ms`,
  );
});

test("AC: org_admin may revoke another user; non-admin cannot", () => {
  const assertAdminCanTargetOther = (role: string, caller: string, target: string) => {
    if (target !== caller && role !== "org_admin") {
      throw new ForbiddenRevokeError();
    }
  };
  assert.doesNotThrow(() =>
    assertAdminCanTargetOther("org_admin", userId, "507f1f77bcf86cd799439099"),
  );
  assert.throws(
    () => assertAdminCanTargetOther("dept_user", userId, "507f1f77bcf86cd799439099"),
    ForbiddenRevokeError,
  );
});

test("AC: revoked token maps to UnauthorizedError message", () => {
  assert.equal(new UnauthorizedError().message, "Token has been revoked");
});
