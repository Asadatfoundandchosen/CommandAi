import { disconnectRedis } from "./redis-client.js";

/** Redis / in-memory cache adapters — implement with ioredis or similar. */
export function createCachePlaceholder(): { mode: "noop" } {
  return { mode: "noop" };
}

export {
  clearSharedRedis,
  createRedisClient,
  getOrCreateRedis,
  getSharedRedis,
  redisRetryDelayMs,
} from "./redis.js";
export {
  connectRedis,
  disconnectRedis,
  getRedisClient,
} from "./redis-client.js";

/** Graceful shutdown — closes ioredis when connected. */
export async function quitRedis(): Promise<void> {
  await disconnectRedis();
}

export {
  requestCacheInvalidation,
  initCacheInvalidationEventListeners,
  invalidateByTag,
} from "./invalidation.js";
