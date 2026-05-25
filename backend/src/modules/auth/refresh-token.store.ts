import { Cluster, Redis } from "ioredis";
import { injectable } from "inversify";

import { getRedisClient } from "../../infrastructure/cache/redis-client.js";
import type { RedisOrCluster } from "../../infrastructure/cache/redis.js";

import { REFRESH_TOKEN_TTL_SEC } from "./jwt.service.js";

/** Active refresh token: `refresh:{userId}:{jti}` */
export const REFRESH_KEY_PREFIX = "refresh:" as const;
/** Consumed refresh token (reuse detection): `refresh:used:{userId}:{jti}` */
export const REFRESH_USED_KEY_PREFIX = "refresh:used:" as const;
/** Short-lived marker after consume to treat concurrent duplicates as benign (not theft). */
export const REFRESH_CONCURRENT_PREFIX = "refresh:concurrent:" as const;

/** Grace window (seconds) for duplicate concurrent refresh with the same JTI. */
export const REFRESH_CONCURRENT_GRACE_SEC = 5;

export function refreshTokenKey(userId: string, jti: string): string {
  return `${REFRESH_KEY_PREFIX}${userId}:${jti}`;
}

export function refreshTokenUsedKey(userId: string, jti: string): string {
  return `${REFRESH_USED_KEY_PREFIX}${userId}:${jti}`;
}

export function refreshTokenConcurrentKey(userId: string, jti: string): string {
  return `${REFRESH_CONCURRENT_PREFIX}${userId}:${jti}`;
}

export type RefreshConsumeResult =
  | "consumed"
  | "reuse"
  | "already_consumed"
  | "unknown";

/**
 * Atomically consume a refresh JTI or classify reuse / concurrent duplicate.
 * KEYS[1]=active, KEYS[2]=used, KEYS[3]=concurrent grace; ARGV[1]=ttl, ARGV[2]=graceSec
 */
export const CONSUME_REFRESH_SCRIPT = `
local activeKey = KEYS[1]
local usedKey = KEYS[2]
local concurrentKey = KEYS[3]
local ttl = tonumber(ARGV[1])
local graceSec = tonumber(ARGV[2])

if redis.call('GET', activeKey) then
  redis.call('DEL', activeKey)
  redis.call('SET', usedKey, '1', 'EX', ttl)
  redis.call('SET', concurrentKey, '1', 'EX', graceSec)
  return 'consumed'
end

if redis.call('GET', concurrentKey) then
  return 'already_consumed'
end

if redis.call('GET', usedKey) then
  return 'reuse'
end

return 'unknown'
`;

function isClusterClient(c: RedisOrCluster): c is Cluster {
  return "nodes" in c && typeof (c as Cluster).nodes === "function";
}

async function deleteKeysByPattern(
  client: RedisOrCluster,
  pattern: string,
): Promise<number> {
  let deleted = 0;

  if (isClusterClient(client)) {
    for (const node of client.nodes("master")) {
      let cursor = "0";
      do {
        const [next, keys] = await node.scan(
          cursor,
          "MATCH",
          pattern,
          "COUNT",
          500,
        );
        cursor = next;
        if (keys.length > 0) {
          deleted += await node.del(...keys);
        }
      } while (cursor !== "0");
    }
    return deleted;
  }

  let cursor = "0";
  do {
    const [next, keys] = await (client as Redis).scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      500,
    );
    cursor = next;
    if (keys.length > 0) {
      deleted += await client.del(...keys);
    }
  } while (cursor !== "0");

  return deleted;
}

@injectable()
export class RefreshTokenStore {
  private client(): RedisOrCluster {
    const redis = getRedisClient();
    if (!redis) {
      throw new Error("Redis unavailable");
    }
    return redis;
  }

  /** Register a new refresh token JTI (valid until consumed or TTL). */
  async register(userId: string, jti: string): Promise<void> {
    await this.client().set(
      refreshTokenKey(userId, jti),
      "1",
      "EX",
      REFRESH_TOKEN_TTL_SEC,
    );
  }

  /**
   * Atomically consume an active refresh JTI, detect theft reuse, or benign concurrent duplicate.
   */
  async consume(userId: string, jti: string): Promise<RefreshConsumeResult> {
    const redis = this.client();
    const raw = await redis.eval(
      CONSUME_REFRESH_SCRIPT,
      3,
      refreshTokenKey(userId, jti),
      refreshTokenUsedKey(userId, jti),
      refreshTokenConcurrentKey(userId, jti),
      String(REFRESH_TOKEN_TTL_SEC),
      String(REFRESH_CONCURRENT_GRACE_SEC),
    );
    if (
      raw === "consumed" ||
      raw === "reuse" ||
      raw === "already_consumed" ||
      raw === "unknown"
    ) {
      return raw;
    }
    return "unknown";
  }

  /** Revoke all active, used, and concurrent grace keys for a user. */
  async invalidateAllUserTokens(userId: string): Promise<number> {
    const redis = this.client();
    const active = await deleteKeysByPattern(
      redis,
      `${REFRESH_KEY_PREFIX}${userId}:*`,
    );
    const used = await deleteKeysByPattern(
      redis,
      `${REFRESH_USED_KEY_PREFIX}${userId}:*`,
    );
    const concurrent = await deleteKeysByPattern(
      redis,
      `${REFRESH_CONCURRENT_PREFIX}${userId}:*`,
    );
    return active + used + concurrent;
  }
}
