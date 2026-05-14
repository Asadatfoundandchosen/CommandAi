import { z } from "zod";

import { sanitizeKeyPart } from "../../common/middleware/rate-limit-sliding.js";
import { getRedisClient } from "./redis-client.js";
import { getCacheTagDescriptorsForPath } from "./cache-tags.js";
import type { RedisOrCluster } from "./redis.js";
import {
  recordCacheInvalidationKeys,
  recordCacheInvalidationRun,
} from "./cache-invalidation-metrics.js";
import { emitValidatedEvent, onValidatedEvent } from "../events/event-validation.js";
import { Events } from "../events/event-types.js";

/**
 * **Tag format** (logical; Redis keys use sanitized org in `{…}` for cluster hash slots where useful):
 * `{org_id}` + `cache:tag:…:r:{resource}[:i:{id}]`.
 * Response cache entries are added to one or more tag **sets**; **invalidate on write** clears
 * them via `SCAN`+`S members`+`DEL` (no unbounded `KEYS` on the whole keyspace in prod).
 */
export const cacheInvalidationEventSchema = z.object({
  orgId: z.string().min(1).max(128),
  resource: z.string().min(1).max(64),
  id: z.string().max(128).optional(),
});

export type CacheInvalidationEvent = z.infer<typeof cacheInvalidationEventSchema>;

let listenersStarted = false;

function buildTagSetKey(
  orgId: string,
  resource: string,
  id?: string,
): string {
  const o = sanitizeKeyPart(orgId, 64);
  const r = sanitizeKeyPart(resource, 64);
  const base = `cache:tag:{${o}}:r:${r}`;
  if (id === undefined) {
    return base;
  }
  return `${base}:i:${sanitizeKeyPart(id, 128)}`;
}

async function flushOneTag(
  redis: RedisOrCluster,
  tagKey: string,
  metricResource: string,
): Promise<void> {
  const members = await redis.smembers(tagKey);
  if (members.length) {
    for (const k of members) {
      await redis.del(k);
    }
    recordCacheInvalidationKeys(metricResource, members.length);
  }
  await redis.del(tagKey);
}

async function scanAllKeys(
  redis: RedisOrCluster,
  pattern: string,
): Promise<string[]> {
  const out: string[] = [];
  let cursor = "0";
  for (;;) {
    const [next, keys] = await redis.scan(
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      200,
    );
    out.push(...keys);
    if (next === "0") {
      break;
    }
    cursor = next;
  }
  return out;
}

/**
 * **Tag-based** invalidation: `resource` and optional `id` must match
 * the tags from GET path parsing (see `getCacheTagDescriptorsForPath`).
 */
export async function invalidateByTag(
  orgId: string,
  resource: string,
  id?: string,
  scope: "all" | "id" | "event" = id ? "id" : "all",
): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    return;
  }
  const resLabel = sanitizeKeyPart(resource, 64);
  const o = sanitizeKeyPart(orgId, 64);

  if (id !== undefined) {
    await flushOneTag(redis, buildTagSetKey(orgId, resource, id), resLabel);
    await flushOneTag(redis, buildTagSetKey(orgId, resource, undefined), resLabel);
    recordCacheInvalidationRun(resLabel, scope);
    return;
  }

  await flushOneTag(redis, buildTagSetKey(orgId, resource, undefined), resLabel);
  const pattern = `cache:tag:{${o}}:r:${resLabel}:i:*`;
  const moreTagKeys = await scanAllKeys(redis, pattern);
  for (const tk of moreTagKeys) {
    await flushOneTag(redis, tk, resLabel);
  }
  recordCacheInvalidationRun(resLabel, scope);
}

export async function registerResponseKeysForPathTags(
  orgId: string,
  fullPath: string,
  responseKey: string,
): Promise<void> {
  const r = getRedisClient();
  if (!r) {
    return;
  }
  for (const desc of getCacheTagDescriptorsForPath(fullPath)) {
    const k = buildTagSetKey(orgId, desc.resource, desc.id);
    await r.sadd(k, responseKey);
  }
}

/** After mutations: emit **event-driven** cache clearing (decoupled handler). */
export function requestCacheInvalidation(payload: CacheInvalidationEvent): void {
  emitValidatedEvent(Events.CACHE_INVALIDATION_REQUESTED, cacheInvalidationEventSchema, payload);
}

/**
 * In-process bus listener: **one** registration per process.
 */
export function initCacheInvalidationEventListeners(): void {
  if (listenersStarted) {
    return;
  }
  listenersStarted = true;
  onValidatedEvent(
    Events.CACHE_INVALIDATION_REQUESTED,
    cacheInvalidationEventSchema,
    async (p) => {
      await invalidateByTag(p.orgId, p.resource, p.id, "event");
    },
  );
}
