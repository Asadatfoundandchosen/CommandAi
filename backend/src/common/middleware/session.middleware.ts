import { config } from "@config/index.js";
import RedisStore from "connect-redis";
import type { RequestHandler } from "express";
import session from "express-session";

import { getRedisClient } from "../../infrastructure/cache/redis-client.js";
import type { RedisOrCluster } from "../../infrastructure/cache/redis.js";

/**
 * express-session with **connect-redis** and the shared **ioredis** / **Cluster** client.
 * **TTL 24h** in Redis and `cookie.maxAge` (align with `config.session`).
 */
export function createSessionMiddleware(): RequestHandler {
  const client = getRedisClient() as RedisOrCluster;
  if (!client) {
    throw new Error("Redis client is required for session store");
  }
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
      secure: config.session.cookie.secure,
      httpOnly: true,
      maxAge: config.session.maxAgeMs,
      sameSite: config.session.cookie.sameSite,
    },
  });
}
