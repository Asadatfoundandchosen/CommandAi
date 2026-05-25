import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import {
  authSessionKey,
  authSessionsUserKey,
  authSessionJtiKey,
} from "./auth-session.service.js";
import type { ClientContext, IAuthSession } from "./auth-session.types.js";
import { REFRESH_TOKEN_TTL_SEC } from "./jwt.service.js";

const client: ClientContext = {
  ip_address: "203.0.113.10",
  device: { type: "desktop", os: "macOS", browser: "Chrome" },
  location: { country: "US", city: "Austin" },
};

/** In-memory Redis stand-in for auth session keys. */
class InMemoryAuthSessionStore {
  private strings = new Map<string, string>();
  private zsets = new Map<string, Map<string, number>>();
  private ttls = new Map<string, number>();

  async set(key: string, value: string, mode?: string, ttlSec?: number): Promise<void> {
    this.strings.set(key, value);
    if (mode === "EX" && typeof ttlSec === "number") {
      this.ttls.set(key, Date.now() + ttlSec * 1000);
    }
  }

  async get(key: string): Promise<string | null> {
    const exp = this.ttls.get(key);
    if (exp !== undefined && exp <= Date.now()) {
      this.strings.delete(key);
      this.ttls.delete(key);
      return null;
    }
    return this.strings.get(key) ?? null;
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const key of keys) {
      if (this.strings.delete(key)) {
        n += 1;
      }
      if (this.zsets.delete(key)) {
        n += 1;
      }
      this.ttls.delete(key);
    }
    return n;
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    const z = this.zsets.get(key) ?? new Map<string, number>();
    z.set(member, score);
    this.zsets.set(key, z);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    const z = this.zsets.get(key);
    if (!z) {
      return [];
    }
    const sorted = [...z.entries()].sort((a, b) => b[1] - a[1]);
    return sorted.slice(start, stop === -1 ? undefined : stop + 1).map(([id]) => id);
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    const z = this.zsets.get(key);
    if (!z) {
      return [];
    }
    const sorted = [...z.entries()].sort((a, b) => a[1] - b[1]);
    return sorted.slice(start, stop + 1).map(([id]) => id);
  }

  async zcard(key: string): Promise<number> {
    return this.zsets.get(key)?.size ?? 0;
  }

  async zrem(key: string, member: string): Promise<void> {
    this.zsets.get(key)?.delete(member);
  }

  async expire(_key: string, _ttl: number): Promise<void> {
    /* no-op for tests */
  }

  multi() {
    const ops: Array<() => Promise<void>> = [];
    const self = this;
    const chain = {
      set(key: string, value: string, mode?: string, ttl?: number) {
        ops.push(async () => {
          await self.set(key, value, mode, ttl);
        });
        return chain;
      },
      zadd(key: string, score: number, member: string) {
        ops.push(async () => {
          await self.zadd(key, score, member);
        });
        return chain;
      },
      del(...keys: string[]) {
        ops.push(async () => {
          await self.del(...keys);
        });
        return chain;
      },
      zrem(key: string, member: string) {
        ops.push(async () => {
          await self.zrem(key, member);
        });
        return chain;
      },
      expire(key: string, ttl: number) {
        ops.push(async () => {
          await self.expire(key, ttl);
        });
        return chain;
      },
      async exec() {
        for (const op of ops) {
          await op();
        }
        return [];
      },
    };
    return chain;
  }

  async createSession(
    sessionId: string,
    userId: string,
    orgId: string,
    refreshJti: string,
    ctx: ClientContext,
  ): Promise<IAuthSession> {
    const now = new Date();
    const session: IAuthSession = {
      session_id: sessionId,
      user_id: userId,
      org_id: orgId,
      refresh_jti: refreshJti,
      device: ctx.device,
      ip_address: ctx.ip_address,
      location: ctx.location,
      created_at: now.toISOString(),
      last_active: now.toISOString(),
      expires_at: new Date(now.getTime() + REFRESH_TOKEN_TTL_SEC * 1000).toISOString(),
    };
    const score = now.getTime();
    await this
      .multi()
      .set(authSessionKey(sessionId), JSON.stringify(session), "EX", REFRESH_TOKEN_TTL_SEC)
      .zadd(authSessionsUserKey(userId), score, sessionId)
      .set(authSessionJtiKey(userId, refreshJti), sessionId, "EX", REFRESH_TOKEN_TTL_SEC)
      .exec();
    return session;
  }

  async touchLastActive(sessionId: string, userId: string): Promise<void> {
    const raw = await this.get(authSessionKey(sessionId));
    if (!raw) {
      return;
    }
    const session = JSON.parse(raw) as IAuthSession;
    const now = new Date();
    session.last_active = now.toISOString();
    await this
      .multi()
      .set(authSessionKey(sessionId), JSON.stringify(session), "EX", REFRESH_TOKEN_TTL_SEC)
      .zadd(authSessionsUserKey(userId), now.getTime(), sessionId)
      .exec();
  }

  async listSessions(userId: string): Promise<IAuthSession[]> {
    const ids = await this.zrevrange(authSessionsUserKey(userId), 0, -1);
    const out: IAuthSession[] = [];
    for (const id of ids) {
      const raw = await this.get(authSessionKey(id));
      if (raw) {
        out.push(JSON.parse(raw) as IAuthSession);
      }
    }
    return out;
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const raw = await this.get(authSessionKey(sessionId));
    if (!raw) {
      return;
    }
    const session = JSON.parse(raw) as IAuthSession;
    if (session.user_id !== userId) {
      return;
    }
    await this
      .multi()
      .del(authSessionKey(sessionId))
      .zrem(authSessionsUserKey(userId), sessionId)
      .del(authSessionJtiKey(userId, session.refresh_jti))
      .exec();
  }
}

test("auth session keys are namespaced per user and session", () => {
  assert.equal(authSessionKey("abc"), "auth:session:abc");
  assert.equal(authSessionsUserKey("user1"), "auth:sessions:user:user1");
  assert.equal(authSessionJtiKey("user1", "jti1"), "auth:session:jti:user1:jti1");
});

test("createSession stores device, IP, and location", async () => {
  const store = new InMemoryAuthSessionStore();
  const userId = "507f1f77bcf86cd799439011";
  const sessionId = randomUUID();
  const session = await store.createSession(
    sessionId,
    userId,
    "507f191e810c19729de860ea",
    "refresh-jti-1",
    client,
  );
  assert.equal(session.device.browser, "Chrome");
  assert.equal(session.ip_address, "203.0.113.10");
  assert.equal(session.location.city, "Austin");
});

test("touchLastActive updates last_active timestamp", async () => {
  const store = new InMemoryAuthSessionStore();
  const userId = "507f1f77bcf86cd799439011";
  const sessionId = randomUUID();
  await store.createSession(sessionId, userId, "507f191e810c19729de860ea", "jti-1", client);
  const before = (await store.listSessions(userId))[0]!;
  await new Promise((r) => setTimeout(r, 5));
  await store.touchLastActive(sessionId, userId);
  const after = (await store.listSessions(userId))[0]!;
  assert.notEqual(after.last_active, before.last_active);
});

test("revokeSession removes session from user index", async () => {
  const store = new InMemoryAuthSessionStore();
  const userId = "507f1f77bcf86cd799439011";
  const sessionId = randomUUID();
  await store.createSession(sessionId, userId, "507f191e810c19729de860ea", "jti-1", client);
  await store.revokeSession(sessionId, userId);
  assert.equal((await store.listSessions(userId)).length, 0);
});
