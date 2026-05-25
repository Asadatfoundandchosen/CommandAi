import { config } from "@config/index.js";
import RedisStore from "connect-redis";
import type { RequestHandler } from "express";
import session from "express-session";

import { getRedisClient } from "../../infrastructure/cache/redis-client.js";
import type { RedisOrCluster } from "../../infrastructure/cache/redis.js";
import { buildHttpOnlyCookieOptions } from "../cookies/auth-cookies.js";

/**
 * express-session with **connect-redis** and the shared **ioredis** / **Cluster** client.
 * Cookie: **HttpOnly** (no JS access), **Secure** (HTTPS in prod), **SameSite** (CSRF), **24h** TTL.
 */
export function createSessionMiddleware(): RequestHandler {
  const client = getRedisClient() as RedisOrCluster;
  if (!client) {
    throw new Error("Redis client is required for session store");
  }
  const cookieOptions = buildHttpOnlyCookieOptions(config.cookies.sessionMaxAgeMs);
  return session({
    store: new RedisStore({
      client,
      prefix: config.session.redisKeyPrefix,
      ttl: config.session.storeTtlSeconds,
    }),
    secret: config.session.secret,
    name: config.session.name,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: cookieOptions.httpOnly,
      secure: cookieOptions.secure,
      sameSite: cookieOptions.sameSite,
      maxAge: cookieOptions.maxAge,
      path: cookieOptions.path,
      ...(cookieOptions.domain ? { domain: cookieOptions.domain } : {}),
    },
  });
}
