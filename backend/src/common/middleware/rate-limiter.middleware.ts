import { createHash } from "node:crypto";

import { config } from "@config/index.js";
import type { Request, RequestHandler } from "express";

import { getRedisClient } from "../../infrastructure/cache/redis-client.js";
import { recordRateLimit429 } from "../../infrastructure/queue/monitoring/rate-limit-metrics.js";

import { setRateLimitHeaders } from "./rate-limit-headers.middleware.js";
import {
  buildSlidingWindowKeys,
  retryAfterSeconds,
  runSlidingWindow,
  sanitizeKeyPart,
} from "./rate-limit-sliding.js";
import { resolveRateLimitTiers } from "./rate-limits.config.js";
import { getOrgIdForRequest } from "./tenant-resolver.js";

function shouldSkipPath(path: string): boolean {
  if (path.startsWith("/api/docs")) {
    return true;
  }
  return false;
}

function getClientKey(req: {
  ip?: string;
  socket: { remoteAddress?: string };
  headers: Record<string, string | string[] | undefined>;
}): string {
  const xf = req.headers["x-forwarded-for"];
  const first =
    typeof xf === "string" ? xf.split(",")[0]?.trim() : undefined;
  const ip = first || req.ip || req.socket.remoteAddress || "0.0.0.0";
  return sanitizeKeyPart(String(ip), 45);
}

/**
 * Per-user tag: JWT `sub`, `req.userId` (rate-limit context), headers, or hashed IP.
 */
function getUserTag(req: Request, clientKey: string): string {
  if (req.user?.sub) {
    return sanitizeKeyPart(req.user.sub, 64);
  }
  if (typeof req.userId === "string" && req.userId.length > 0) {
    return sanitizeKeyPart(req.userId, 64);
  }
  if (typeof req.apiKeyId === "string" && req.apiKeyId.length > 0) {
    return sanitizeKeyPart(`apikey:${req.apiKeyId}`, 80);
  }
  const h = req.headers["x-user-id"] ?? req.headers["X-User-Id"];
  if (typeof h === "string" && h.length > 0) {
    return sanitizeKeyPart(h, 64);
  }
  const q = req.query.user_id;
  if (typeof q === "string" && q.length > 0) {
    return sanitizeKeyPart(q, 64);
  }
  return `ip:${clientKey}`;
}

function hashIpUser(clientKey: string): string {
  return createHash("sha256").update(`u:${clientKey}`, "utf8").digest("hex").slice(0, 32);
}

/**
 * Sliding-window rate limiter (Redis ZSET + EVAL).
 * Limits per **tenant**, **user**, and **endpoint**; returns **429** + **Retry-After** when exceeded.
 */
export function createRateLimitMiddleware(): RequestHandler {
  return async (req, res, next) => {
    if (req.method === "OPTIONS" || shouldSkipPath(req.path)) {
      next();
      return;
    }
    if (!config.rateLimit.enabled) {
      next();
      return;
    }
    const client = getRedisClient();
    if (!client) {
      next();
      return;
    }

    const now = Date.now();
    const nowSec = Math.floor(now / 1000);
    const clientKey = getClientKey(req);
    const tenant = getOrgIdForRequest(req);
    const uRaw = getUserTag(req, clientKey);
    const userTag =
      uRaw === `ip:${clientKey}` ? `anon:${hashIpUser(clientKey)}` : uRaw;
    const ep = `${req.baseUrl || ""}${req.path || ""}`;
    const tiers = resolveRateLimitTiers(ep);

    const keys = buildSlidingWindowKeys(tenant, userTag, ep);
    const win1 = tiers.tenant.window * 1000;
    const win2 = tiers.user.window * 1000;
    const win3 = tiers.endpoint.window * 1000;

    try {
      const result = await runSlidingWindow(
        client,
        keys,
        {
          w1Ms: win1,
          m1: tiers.tenant.max,
          w2Ms: win2,
          m2: tiers.user.max,
          w3Ms: win3,
          m3: tiers.endpoint.max,
        },
        now,
      );

      if (!result.ok) {
        const dim = result.dim === 1 ? "tenant" : result.dim === 2 ? "user" : "endpoint";
        recordRateLimit429(dim);
        const failM = result.dim === 1 ? result.m1 : result.dim === 2 ? result.m2 : result.m3;
        const wMs = result.wMs;
        const retryAfter = retryAfterSeconds(wMs);
        const resetSec = nowSec + retryAfter;

        setRateLimitHeaders(res, failM, 0, resetSec);
        res.set("Retry-After", String(retryAfter));
        res.status(429).json({
          error: "Too Many Requests",
          code: "rate_limit",
          retryAfter,
        });
        return;
      }

      const { c1, c2, c3, m1, m2, m3, w1, w2, w3 } = result;
      const r1 = Math.max(0, m1 - c1);
      const r2 = Math.max(0, m2 - c2);
      const r3 = Math.max(0, m3 - c3);
      const remainings = [r1, r2, r3];
      const lims = [m1, m2, m3];
      const ws = [w1, w2, w3];
      let idx = 0;
      for (let i = 1; i < 3; i += 1) {
        if (remainings[i]! < remainings[idx]!) {
          idx = i;
        }
      }
      const resetSec = nowSec + retryAfterSeconds(ws[idx]!);
      setRateLimitHeaders(res, lims[idx]!, remainings[idx]!, resetSec);
      next();
    } catch (e) {
      process.stderr.write(`rate limiter EVAL failed (fail open): ${String(e)}\n`);
      next();
    }
  };
}
