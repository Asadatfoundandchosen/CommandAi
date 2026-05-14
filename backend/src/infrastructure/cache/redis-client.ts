import type { AppConfig } from "@config/index.js";

import {
  clearSharedRedis,
  getOrCreateRedis,
  getSharedRedis,
  type RedisOrCluster,
} from "./redis.js";

export {
  clearSharedRedis,
  getOrCreateRedis,
  getSharedRedis,
} from "./redis.js";
export type { RedisOrCluster } from "./redis.js";

export function getRedisClient(): RedisOrCluster | null {
  return getSharedRedis();
}

/**
 * Ensures a single ioredis / Cluster and runs **PING** (shared with BullMQ **connection**).
 */
export async function connectRedis(redis: AppConfig["redis"]): Promise<void> {
  const c = getOrCreateRedis(redis);
  await c.ping();
}

export async function disconnectRedis(): Promise<void> {
  const c = getSharedRedis();
  if (c) {
    await c.quit();
    clearSharedRedis();
  }
}
