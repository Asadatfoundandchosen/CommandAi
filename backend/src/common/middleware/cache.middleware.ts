import { createHash } from "node:crypto";

import { config } from "@config/index.js";
import type { Request, RequestHandler, Response } from "express";

import { getRedisClient } from "../../infrastructure/cache/redis-client.js";
import {
  recordResponseCacheBypass,
  recordResponseCacheHit,
  recordResponseCacheMiss,
} from "../../infrastructure/queue/monitoring/response-cache-metrics.js";
import { getOrgIdForRequest } from "./tenant-resolver.js";
import { registerResponseKeysForPathTags } from "../../infrastructure/cache/invalidation.js";

/**
 * **Per-path TTL** (seconds) for **GET** JSON response cache-aside. Longest **prefix** wins.
 * Add future routes (e.g. `agents`, `signals`) as they are mounted under `/api/v1/...`.
 */
export const defaultResponseCacheTtlByPath: Record<string, number> = {
  "/api/v1/agents": 60,
  "/api/v1/signals": 10,
  "/api/v1/config": 300,
  "/api/v1/organization": 30,
  "/api/v1/contracts": 300,
  "/api/v1/plans": 300,
  "/api/v1/usage": 60,
  /** Current platform example (tune with `pathTtlOverrides` or add `/api/v1/...` when mounted). */
  "/api/users": 60,
  "/api/webhooks": 30,
};

function normalizeResourcePath(req: Request): string {
  const p = (req.baseUrl + req.path).split("?")[0] || req.path;
  if (p.length > 0 && p.length <= 500) {
    return p;
  }
  return createHash("sha256")
    .update((req.baseUrl + req.path).split("?")[0] ?? "", "utf8")
    .digest("hex");
}

/**
 * Longest **prefix** match: `/api/users` matches `/api/users` and `/api/users/…`.
 */
export function getTtlSecondsForPath(
  fullPath: string,
  table: Record<string, number>,
): number | null {
  const p = fullPath.split("?")[0];
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    if (p === k) {
      return table[k]!;
    }
    if (p.startsWith(k + "/")) {
      return table[k]!;
    }
  }
  return null;
}

function stableQueryHash(req: Request): string {
  const q = req.query;
  if (!q || typeof q !== "object" || Object.keys(q).length === 0) {
    return "0";
  }
  const keys = Object.keys(q as object).sort();
  const parts = keys.map((k) => {
    const v = (q as Record<string, unknown>)[k];
    if (Array.isArray(v)) {
      return [k, v.map((x) => String(x)).join(",")];
    }
    if (v === undefined) {
      return [k, ""];
    }
    if (v === null) {
      return [k, "null"];
    }
    return [k, String(v)];
  });
  return createHash("sha256")
    .update(JSON.stringify(parts), "utf8")
    .digest("hex")
    .slice(0, 32);
}

/**
 * `cache:resp:{org_id}:{path}:{qhash}` — **org_id** is never taken from the body.
 */
export function buildResponseCacheKey(req: Request): string {
  const org = getOrgIdForRequest(req);
  const pathPart = normalizeResourcePath(req);
  const qh = stableQueryHash(req);
  return `cache:resp:${org}:${pathPart}:${qh}`;
}

function shouldSkipPathForCache(p: string): boolean {
  if (p.startsWith("/api/docs")) {
    return true;
  }
  if (p.startsWith("/api/sessions")) {
    return true;
  }
  if (p.startsWith("/api/dlq")) {
    return true;
  }
    if (p.startsWith("/api/scheduler")) {
      return true;
    }
    if (p.startsWith("/api/search")) {
      return true;
    }
    if (p.startsWith("/api/files")) {
      return true;
    }
  if (p.startsWith("/api/admin") || p.startsWith("/admin")) {
    return true;
  }
  return false;
}

function isCacheBypassHeader(req: Request): boolean {
  const h = req.headers["x-cache-bypass"];
  if (h === undefined) {
    return false;
  }
  const s = String(h).toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

/**
 * **Cache-aside** for **GET** with a matching path prefix: `GET` from Redis, on miss run the
 * stack and `SET` the **200** `res.send` / `res.json` body (string) with per-path **TTL**.
 * Optional `pathTtlOverrides` merges on top of {@link defaultResponseCacheTtlByPath}.
 */
export function createResponseCacheMiddleware(
  pathTtlOverrides?: Record<string, number>,
): RequestHandler {
  const pathTtl = {
    ...defaultResponseCacheTtlByPath,
    ...pathTtlOverrides,
  };
  return async (req, res, next) => {
    if (req.method !== "GET") {
      next();
      return;
    }
    if (isCacheBypassHeader(req)) {
      res.set("X-Cache", "BYPASS");
      recordResponseCacheBypass();
      next();
      return;
    }
    if (!config.responseCache.enabled) {
      next();
      return;
    }
    const client = getRedisClient();
    if (!client) {
      next();
      return;
    }

    const fullPath = normalizeResourcePath(req);
    if (shouldSkipPathForCache(fullPath)) {
      next();
      return;
    }

    const ttl = getTtlSecondsForPath(fullPath, pathTtl);
    if (ttl === null || ttl <= 0) {
      next();
      return;
    }

    const key = buildResponseCacheKey(req);

    try {
      const hit = await client.get(key);
      if (hit !== null) {
        res.set("X-Cache", "HIT");
        res.set("Content-Type", "application/json; charset=utf-8");
        recordResponseCacheHit();
        res.status(200).send(hit);
        return;
      }
    } catch (e) {
      process.stderr.write(`response cache GET failed (fail open): ${String(e)}\n`);
      next();
      return;
    }

    recordResponseCacheMiss();
    res.set("X-Cache", "MISS");
    wrapSendToStore(client, res, key, ttl, req);
    next();
  };
}

function wrapSendToStore(
  client: NonNullable<ReturnType<typeof getRedisClient>>,
  res: Response,
  key: string,
  ttlSec: number,
  req: Request,
): void {
  const oldSend = res.send.bind(res);
  res.send = (body: unknown) => {
    if (res.statusCode === 200) {
      let toStore: string;
      if (Buffer.isBuffer(body)) {
        toStore = body.toString("utf8");
      } else if (typeof body === "string") {
        toStore = body;
      } else if (body === undefined) {
        toStore = "null";
      } else {
        toStore = JSON.stringify(body);
      }
      const org = getOrgIdForRequest(req);
      const fullPath = normalizeResourcePath(req);
      void client
        .set(key, toStore, "EX", ttlSec)
        .then(async () => {
          try {
            await registerResponseKeysForPathTags(org, fullPath, key);
          } catch (e) {
            process.stderr.write(
              `response cache tag register failed: ${String(e)}\n`,
            );
          }
        })
        .catch((e) => {
          process.stderr.write(`response cache SET failed: ${String(e)}\n`);
        });
    }
    return oldSend(body) as Response;
  };
}
