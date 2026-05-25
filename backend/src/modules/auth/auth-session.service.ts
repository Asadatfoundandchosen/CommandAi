import { inject, injectable } from "inversify";

import { config } from "@config/index.js";
import { getRedisClient } from "../../infrastructure/cache/redis-client.js";

import type {
  AuthSessionView,
  ClientContext,
  IAuthSession,
} from "./auth-session.types.js";
import { REFRESH_TOKEN_TTL_SEC } from "./jwt.service.js";
import {
  RefreshTokenStore,
  refreshTokenKey,
} from "./refresh-token.store.js";

export const AUTH_SESSION_KEY_PREFIX = "auth:session:" as const;
export const AUTH_SESSIONS_USER_KEY_PREFIX = "auth:sessions:user:" as const;
export const AUTH_SESSION_JTI_KEY_PREFIX = "auth:session:jti:" as const;

export function authSessionKey(sessionId: string): string {
  return `${AUTH_SESSION_KEY_PREFIX}${sessionId}`;
}

export function authSessionsUserKey(userId: string): string {
  return `${AUTH_SESSIONS_USER_KEY_PREFIX}${userId}`;
}

export function authSessionJtiKey(userId: string, jti: string): string {
  return `${AUTH_SESSION_JTI_KEY_PREFIX}${userId}:${jti}`;
}

export class SessionNotFoundError extends Error {
  constructor() {
    super("Session not found");
    this.name = "SessionNotFoundError";
  }
}

@injectable()
export class AuthSessionService {
  constructor(
    @inject(RefreshTokenStore) private readonly refreshStore: RefreshTokenStore,
  ) {}

  private client() {
    const redis = getRedisClient();
    if (!redis) {
      throw new Error("Redis unavailable");
    }
    return redis;
  }

  /** Create a session, enforce concurrent limit, and index by user + refresh JTI. */
  async createSession(
    sessionId: string,
    userId: string,
    orgId: string,
    refreshJti: string,
    client: ClientContext,
  ): Promise<IAuthSession> {
    const redis = this.client();
    await this.enforceMaxConcurrentSessions(userId);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_SEC * 1000);

    const session: IAuthSession = {
      session_id: sessionId,
      user_id: userId,
      org_id: orgId,
      refresh_jti: refreshJti,
      device: client.device,
      ip_address: client.ip_address,
      location: client.location,
      created_at: now.toISOString(),
      last_active: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    };

    const userKey = authSessionsUserKey(userId);
    const score = now.getTime();
    await redis
      .multi()
      .set(authSessionKey(sessionId), JSON.stringify(session), "EX", REFRESH_TOKEN_TTL_SEC)
      .zadd(userKey, score, sessionId)
      .set(
        authSessionJtiKey(userId, refreshJti),
        sessionId,
        "EX",
        REFRESH_TOKEN_TTL_SEC,
      )
      .expire(userKey, REFRESH_TOKEN_TTL_SEC)
      .exec();

    return session;
  }

  /** Update refresh JTI after token rotation (same session id). */
  async rotateRefreshJti(
    sessionId: string,
    userId: string,
    previousJti: string,
    newJti: string,
  ): Promise<void> {
    const redis = this.client();
    const raw = await redis.get(authSessionKey(sessionId));
    if (!raw) {
      return;
    }

    const session = JSON.parse(raw) as IAuthSession;
    if (session.user_id !== userId) {
      return;
    }

    const now = new Date();
    session.refresh_jti = newJti;
    session.last_active = now.toISOString();

    await redis
      .multi()
      .set(authSessionKey(sessionId), JSON.stringify(session), "EX", REFRESH_TOKEN_TTL_SEC)
      .zadd(authSessionsUserKey(userId), now.getTime(), sessionId)
      .del(authSessionJtiKey(userId, previousJti))
      .set(
        authSessionJtiKey(userId, newJti),
        sessionId,
        "EX",
        REFRESH_TOKEN_TTL_SEC,
      )
      .exec();
  }

  /** Bump `last_active` on authenticated API requests. */
  async touchLastActive(sessionId: string, userId: string): Promise<void> {
    const redis = this.client();
    const raw = await redis.get(authSessionKey(sessionId));
    if (!raw) {
      return;
    }

    const session = JSON.parse(raw) as IAuthSession;
    if (session.user_id !== userId) {
      return;
    }

    const now = new Date();
    session.last_active = now.toISOString();

    await redis
      .multi()
      .set(authSessionKey(sessionId), JSON.stringify(session), "EX", REFRESH_TOKEN_TTL_SEC)
      .zadd(authSessionsUserKey(userId), now.getTime(), sessionId)
      .exec();
  }

  async listSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<AuthSessionView[]> {
    const redis = this.client();
    const ids = await redis.zrevrange(authSessionsUserKey(userId), 0, -1);
    const views: AuthSessionView[] = [];

    for (const sessionId of ids) {
      const raw = await redis.get(authSessionKey(sessionId));
      if (!raw) {
        await redis.zrem(authSessionsUserKey(userId), sessionId);
        continue;
      }
      const session = JSON.parse(raw) as IAuthSession;
      if (session.user_id !== userId) {
        continue;
      }
      const { refresh_jti: _jti, ...rest } = session;
      views.push({
        ...rest,
        current: currentSessionId === sessionId,
      });
    }

    return views;
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const redis = this.client();
    const raw = await redis.get(authSessionKey(sessionId));
    if (!raw) {
      throw new SessionNotFoundError();
    }

    const session = JSON.parse(raw) as IAuthSession;
    if (session.user_id !== userId) {
      throw new SessionNotFoundError();
    }

    await this.removeSessionRecord(session);
    await redis.del(refreshTokenKey(userId, session.refresh_jti));
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const redis = this.client();
    const ids = await redis.zrange(authSessionsUserKey(userId), 0, -1);
    let removed = 0;

    for (const sessionId of ids) {
      const raw = await redis.get(authSessionKey(sessionId));
      if (!raw) {
        await redis.zrem(authSessionsUserKey(userId), sessionId);
        continue;
      }
      const session = JSON.parse(raw) as IAuthSession;
      await this.removeSessionRecord(session);
      removed += 1;
    }

    await redis.del(authSessionsUserKey(userId));
    return removed;
  }

  private async removeSessionRecord(session: IAuthSession): Promise<void> {
    const redis = this.client();
    await redis
      .multi()
      .del(authSessionKey(session.session_id))
      .zrem(authSessionsUserKey(session.user_id), session.session_id)
      .del(authSessionJtiKey(session.user_id, session.refresh_jti))
      .exec();
  }

  private async enforceMaxConcurrentSessions(userId: string): Promise<void> {
    const max = config.authSessions.maxConcurrent;
    if (max <= 0) {
      return;
    }

    const redis = this.client();
    const userKey = authSessionsUserKey(userId);
    const count = await redis.zcard(userKey);
    if (count < max) {
      return;
    }

    const excess = count - max + 1;
    const oldest = await redis.zrange(userKey, 0, excess - 1);
    for (const sessionId of oldest) {
      try {
        await this.revokeSession(sessionId, userId);
      } catch {
        await redis.zrem(userKey, sessionId);
        await redis.del(authSessionKey(sessionId));
      }
    }
  }
}
