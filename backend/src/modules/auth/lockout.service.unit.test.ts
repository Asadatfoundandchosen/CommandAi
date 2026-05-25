import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LOCKOUT_DURATIONS,
  lockoutAttemptsKey,
  lockedKey,
  MAX_FAILED_ATTEMPTS_BEFORE_LOCK,
} from "./lockout.service.js";

/** In-memory Redis stand-in matching lockout key semantics. */
class InMemoryLockoutStore {
  private counters = new Map<string, number>();
  private locks = new Map<string, { expiresAt: number }>();
  private counterExpiry = new Map<string, number>();

  async incr(key: string): Promise<number> {
    const next = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, next);
    return next;
  }

  async expire(key: string, _ttlSec: number): Promise<void> {
    this.counterExpiry.set(key, Date.now() + 3600_000);
  }

  async set(key: string, value: string, mode: string, ttlSec: number): Promise<void> {
    if (mode === "EX" && value === "1") {
      this.locks.set(key, { expiresAt: Date.now() + ttlSec * 1000 });
    }
  }

  async get(key: string): Promise<string | null> {
    const lock = this.locks.get(key);
    if (lock) {
      if (lock.expiresAt <= Date.now()) {
        this.locks.delete(key);
        return null;
      }
      return "1";
    }
    return null;
  }

  async ttl(key: string): Promise<number> {
    const lock = this.locks.get(key);
    if (!lock) {
      return -2;
    }
    const remaining = Math.ceil((lock.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const key of keys) {
      if (this.counters.delete(key)) {
        n += 1;
      }
      if (this.locks.delete(key)) {
        n += 1;
      }
      if (this.counterExpiry.delete(key)) {
        n += 1;
      }
    }
    return n;
  }

  async recordFailedAttempt(userId: string) {
    const key = lockoutAttemptsKey(userId);
    const attempts = await this.incr(key);
    await this.expire(key, 3600);
    if (attempts >= MAX_FAILED_ATTEMPTS_BEFORE_LOCK) {
      const lockoutIndex = Math.min(
        attempts - MAX_FAILED_ATTEMPTS_BEFORE_LOCK,
        LOCKOUT_DURATIONS.length - 1,
      );
      const duration = LOCKOUT_DURATIONS[lockoutIndex];
      await this.set(lockedKey(userId), "1", "EX", duration);
      return { locked: true as const, attempts, duration };
    }
    return { locked: false as const, attempts };
  }

  async isLocked(userId: string): Promise<boolean> {
    return (await this.get(lockedKey(userId))) !== null;
  }

  async clearLockout(userId: string): Promise<void> {
    await this.del(lockoutAttemptsKey(userId), lockedKey(userId));
  }
}

test("lockout keys are scoped per user", () => {
  assert.equal(lockoutAttemptsKey("user1"), "lockout:user1");
  assert.equal(lockedKey("user1"), "locked:user1");
});

test("locks after 5 failed attempts with 60s duration", async () => {
  const store = new InMemoryLockoutStore();
  const userId = "507f1f77bcf86cd799439011";
  for (let i = 0; i < 4; i += 1) {
    const r = await store.recordFailedAttempt(userId);
    assert.equal(r.locked, false);
  }
  const fifth = await store.recordFailedAttempt(userId);
  assert.equal(fifth.locked, true);
  assert.equal(fifth.attempts, 5);
  assert.equal(fifth.duration, 60);
  assert.equal(await store.isLocked(userId), true);
});

test("progressive lockout escalates duration on continued failures", async () => {
  const store = new InMemoryLockoutStore();
  const userId = "507f191e810c19729de860ea";
  let lastDuration = 0;
  for (let i = 0; i < 8; i += 1) {
    const r = await store.recordFailedAttempt(userId);
    if (r.locked) {
      lastDuration = r.duration;
    }
  }
  assert.equal(lastDuration, LOCKOUT_DURATIONS[LOCKOUT_DURATIONS.length - 1]);
});

test("clearLockout removes lock and attempt counter", async () => {
  const store = new InMemoryLockoutStore();
  const userId = "507f1f77bcf86cd799439011";
  for (let i = 0; i < 5; i += 1) {
    await store.recordFailedAttempt(userId);
  }
  assert.equal(await store.isLocked(userId), true);
  await store.clearLockout(userId);
  assert.equal(await store.isLocked(userId), false);
  const r = await store.recordFailedAttempt(userId);
  assert.equal(r.attempts, 1);
  assert.equal(r.locked, false);
});
