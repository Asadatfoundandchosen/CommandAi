import { Cluster, Redis, type ClusterNode, type RedisOptions } from "ioredis";

import type { AppConfig } from "@config/index.js";

/**
 * ioredis **Redis** (standalone) or **Cluster** (ElastiCache / Redis 7+).
 * One singleton per process; **pooling** is internal; BullMQ needs `maxRetriesPerRequest: null`.
 */
export type RedisOrCluster = Redis | Cluster;

const MAX_LINEAR_BACKOFF_MS = 3_000;
const MAX_RETRIES = 10;

let shared: RedisOrCluster | null = null;

/** Exponential-ish backoff; stop after MAX_RETRIES. */
export function redisRetryDelayMs(attempt: number): number | null {
  if (attempt > MAX_RETRIES) {
    return null;
  }
  return Math.min(100 * 2 ** Math.min(attempt, 5), MAX_LINEAR_BACKOFF_MS);
}

function baseRedisOptions(): RedisOptions {
  return {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    connectTimeout: 10_000,
    retryStrategy(attempt: number) {
      const d = redisRetryDelayMs(attempt);
      return d === null ? 0 : d;
    },
  };
}

function toClusterNodes(
  config: AppConfig["redis"],
): [ClusterNode, ...ClusterNode[]] {
  const h = config.host;
  const p = config.port;
  if (!h) {
    throw new Error("Redis host missing for cluster mode");
  }
  return [{ host: h, port: p }];
}

/**
 * One **ioredis** / **Cluster** per process, shared with BullMQ and health checks.
 */
export function getOrCreateRedis(config: AppConfig["redis"]): RedisOrCluster {
  shared ??= buildRedisClient(config);
  return shared;
}

export function getSharedRedis(): RedisOrCluster | null {
  return shared;
}

export function clearSharedRedis(): void {
  shared = null;
}

function buildRedisClient(config: AppConfig["redis"]): RedisOrCluster {
  if (config.mode === "cluster") {
    const nodes = toClusterNodes(config);
    const { password, username, tls } = config.connection;
    return new Cluster(nodes, {
      scaleReads: "slave",
      enableReadyCheck: true,
      clusterRetryStrategy(attempt) {
        const d = redisRetryDelayMs(attempt);
        if (d === null) {
          return 0;
        }
        return d;
      },
      redisOptions: {
        maxRetriesPerRequest: null,
        connectTimeout: 10_000,
        ...(tls ? { tls: { rejectUnauthorized: true } } : {}),
        ...(password ? { password } : {}),
        ...(username ? { username } : {}),
      },
    });
  }
  return new Redis(config.url, {
    ...baseRedisOptions(),
    ...(config.connection.tls
      ? { tls: { rejectUnauthorized: true } as NonNullable<RedisOptions["tls"]> }
      : {}),
  });
}

/**
 * @deprecated use `getOrCreateRedis` — for tests that need a fresh build.
 */
export function createRedisClient(config: AppConfig["redis"]): RedisOrCluster {
  return buildRedisClient(config);
}
