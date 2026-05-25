import { inject, injectable } from "inversify";
import jwt from "jsonwebtoken";

import { getRedisClient } from "../../infrastructure/cache/redis-client.js";

import { logAuthTokenOperation } from "./auth-token.logger.js";
import { REFRESH_TOKEN_TTL_SEC } from "./jwt.service.js";
import { RefreshTokenStore } from "./refresh-token.store.js";

export const BLACKLIST_KEY_PREFIX = "blacklist:" as const;
export const USER_REVOKED_KEY_PREFIX = "auth:revoked:" as const;

export function blacklistKey(token: string): string {
  return `${BLACKLIST_KEY_PREFIX}${token}`;
}

export function userRevokedKey(userId: string): string {
  return `${USER_REVOKED_KEY_PREFIX}${userId}`;
}

/** Remaining TTL (seconds) for Redis `EX` — aligns blacklist expiry with JWT `exp`. */
export function tokenTtlSeconds(token: string): number | null {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === "string" || typeof decoded.exp !== "number") {
    return null;
  }
  return decoded.exp - Math.floor(Date.now() / 1000);
}

function tokenIssuedAtSec(token: string): number | null {
  const decoded = jwt.decode(token);
  if (!decoded || typeof decoded === "string" || typeof decoded.iat !== "number") {
    return null;
  }
  return decoded.iat;
}

@injectable()
export class TokenBlacklistService {
  constructor(
    @inject(RefreshTokenStore) private readonly refreshStore: RefreshTokenStore,
  ) {}

  /** Blacklist a JWT until its natural `exp` (Redis TTL). */
  async blacklistToken(token: string): Promise<void> {
    const redis = getRedisClient();
    if (!redis) {
      throw new Error("Redis unavailable");
    }
    const ttl = tokenTtlSeconds(token);
    if (ttl !== null && ttl > 0) {
      await redis.set(blacklistKey(token), "1", "EX", ttl);
      logAuthTokenOperation("token_blacklisted", {
        ttl_seconds: ttl,
        issued_at: tokenIssuedAtSec(token) ?? undefined,
      });
    }
  }

  async isBlacklisted(token: string): Promise<boolean> {
    const redis = getRedisClient();
    if (!redis) {
      return false;
    }
    const hit = await redis.get(blacklistKey(token));
    return hit !== null;
  }

  /**
   * Single Redis round-trip (`MGET`) for per-token blacklist + user revocation epoch.
   * Target &lt; 5ms on local/ElastiCache (one network hop).
   */
  async checkRevoked(
    token: string,
    userId: string,
    issuedAtSec: number,
  ): Promise<{ blacklisted: boolean; userRevoked: boolean }> {
    const redis = getRedisClient();
    if (!redis) {
      return { blacklisted: false, userRevoked: false };
    }
    const [blacklistHit, revokedRaw] = await redis.mget(
      blacklistKey(token),
      userRevokedKey(userId),
    );
    if (blacklistHit !== null) {
      return { blacklisted: true, userRevoked: false };
    }
    if (revokedRaw === null) {
      return { blacklisted: false, userRevoked: false };
    }
    const revokedAt = Number(revokedRaw);
    if (!Number.isFinite(revokedAt)) {
      return { blacklisted: false, userRevoked: false };
    }
    return { blacklisted: false, userRevoked: issuedAtSec < revokedAt };
  }

  /**
   * Revoke all tokens for a user: set revocation epoch (blocks tokens issued before now)
   * and clear refresh JTIs in Redis.
   */
  async revokeAllUserTokens(userId: string): Promise<number> {
    const redis = getRedisClient();
    if (!redis) {
      throw new Error("Redis unavailable");
    }
    const revokedAt = Math.floor(Date.now() / 1000);
    await redis.set(
      userRevokedKey(userId),
      String(revokedAt),
      "EX",
      REFRESH_TOKEN_TTL_SEC,
    );
    const keysRemoved = await this.refreshStore.invalidateAllUserTokens(userId);
    logAuthTokenOperation("user_tokens_revoked", {
      user_id: userId,
      revoked_at: revokedAt,
      keys_removed: keysRemoved,
    });
    return keysRemoved;
  }

  /** True when token `iat` is strictly before the user's revocation epoch. */
  async isUserRevoked(userId: string, issuedAtSec: number): Promise<boolean> {
    const redis = getRedisClient();
    if (!redis) {
      return false;
    }
    const raw = await redis.get(userRevokedKey(userId));
    if (!raw) {
      return false;
    }
    const revokedAt = Number(raw);
    if (!Number.isFinite(revokedAt)) {
      return false;
    }
    return issuedAtSec < revokedAt;
  }
}
