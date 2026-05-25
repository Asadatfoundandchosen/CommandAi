import { injectable } from "inversify";

import { getRedisClient } from "../../infrastructure/cache/redis-client.js";

import { logAuthTokenOperation } from "./auth-token.logger.js";

/** Progressive lockout durations (seconds): 1 min → 5 min → 15 min → 1 hr. */
export const LOCKOUT_DURATIONS = [60, 300, 900, 3600] as const;

export const MAX_FAILED_ATTEMPTS_BEFORE_LOCK = 5;

/** Failed-attempt counter TTL — resets after 1 hour with no failures. */
export const LOCKOUT_ATTEMPTS_WINDOW_SEC = 3600;

export const LOCKOUT_ATTEMPTS_KEY_PREFIX = "lockout:" as const;
export const LOCKED_KEY_PREFIX = "locked:" as const;

export function lockoutAttemptsKey(userId: string): string {
  return `${LOCKOUT_ATTEMPTS_KEY_PREFIX}${userId}`;
}

export function lockedKey(userId: string): string {
  return `${LOCKED_KEY_PREFIX}${userId}`;
}

export type RecordFailedAttemptResult =
  | { locked: false; attempts: number }
  | { locked: true; attempts: number; duration: number };

@injectable()
export class LockoutService {
  private client() {
    const redis = getRedisClient();
    if (!redis) {
      throw new Error("Redis unavailable");
    }
    return redis;
  }

  async isLocked(userId: string): Promise<boolean> {
    const redis = this.client();
    const hit = await redis.get(lockedKey(userId));
    return hit !== null;
  }

  /** Seconds until lock expires (`0` if not locked). */
  async getLockedRemainingSec(userId: string): Promise<number> {
    const redis = this.client();
    const ttl = await redis.ttl(lockedKey(userId));
    return ttl > 0 ? ttl : 0;
  }

  async recordFailedAttempt(userId: string): Promise<RecordFailedAttemptResult> {
    const redis = this.client();
    const attemptsKey = lockoutAttemptsKey(userId);
    const attempts = await redis.incr(attemptsKey);
    await redis.expire(attemptsKey, LOCKOUT_ATTEMPTS_WINDOW_SEC);

    if (attempts >= MAX_FAILED_ATTEMPTS_BEFORE_LOCK) {
      const lockoutIndex = Math.min(
        attempts - MAX_FAILED_ATTEMPTS_BEFORE_LOCK,
        LOCKOUT_DURATIONS.length - 1,
      );
      const duration = LOCKOUT_DURATIONS[lockoutIndex];
      await redis.set(lockedKey(userId), "1", "EX", duration);
      logAuthTokenOperation("account_locked", {
        user_id: userId,
        attempts,
        lockout_duration_sec: duration,
        lockout_tier: lockoutIndex,
      });
      return { locked: true, attempts, duration };
    }

    return { locked: false, attempts };
  }

  /** Clear failed-attempt counter and active lock after successful login. */
  async clearLockout(userId: string): Promise<void> {
    const redis = this.client();
    await redis.del(lockoutAttemptsKey(userId), lockedKey(userId));
  }
}
