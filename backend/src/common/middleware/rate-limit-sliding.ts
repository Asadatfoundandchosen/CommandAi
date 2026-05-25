import { createHash, randomUUID } from "node:crypto";

import type { RedisOrCluster } from "../../infrastructure/cache/redis.js";

/**
 * Atomic sliding window for three sorted sets (ZADD / ZREMRANGEBYSCORE / ZCARD).
 * Wrapped in a single **EVAL** (one atomic server-side script), which is the usual
 * pattern for this algorithm; **MULTI/EXEC** would be multiple round-trips.
 * Keys use the same **hash tag** `{t}` for Redis **Cluster** slot co-location.
 */
const SLIDING_LUA = `
local k1, k2, k3 = KEYS[1], KEYS[2], KEYS[3]
local w1, m1 = tonumber(ARGV[1]), tonumber(ARGV[2])
local w2, m2 = tonumber(ARGV[3]), tonumber(ARGV[4])
local w3, m3 = tonumber(ARGV[5]), tonumber(ARGV[6])
local now = tonumber(ARGV[7])
local mid = ARGV[8]
redis.call('ZREMRANGEBYSCORE', k1, '-inf', now - w1)
redis.call('ZREMRANGEBYSCORE', k2, '-inf', now - w2)
redis.call('ZREMRANGEBYSCORE', k3, '-inf', now - w3)
local c1 = redis.call('ZCARD', k1)
local c2 = redis.call('ZCARD', k2)
local c3 = redis.call('ZCARD', k3)
if c1 >= m1 then
  return {0, 1, c1, c2, c3, m1, m2, m3, w1}
end
if c2 >= m2 then
  return {0, 2, c1, c2, c3, m1, m2, m3, w2}
end
if c3 >= m3 then
  return {0, 3, c1, c2, c3, m1, m2, m3, w3}
end
redis.call('ZADD', k1, now, mid .. '-t')
redis.call('ZADD', k2, now, mid .. '-u')
redis.call('ZADD', k3, now, mid .. '-e')
local e = math.max(math.ceil(w1 / 1000), math.ceil(w2 / 1000), math.ceil(w3 / 1000)) + 1
redis.call('EXPIRE', k1, e)
redis.call('EXPIRE', k2, e)
redis.call('EXPIRE', k3, e)
c1 = redis.call('ZCARD', k1)
c2 = redis.call('ZCARD', k2)
c3 = redis.call('ZCARD', k3)
return {1, c1, c2, c3, m1, m2, m3, w1, w2, w3}
`;

export function sanitizeKeyPart(s: string, max = 64): string {
  const t = s.replaceAll(/[^a-zA-Z0-9._-]+/g, "_").slice(0, max);
  return t.length > 0 ? t : "none";
}

export function endpointId(path: string): string {
  const p = path.length > 200 ? createHash("sha256").update(path, "utf8").digest("hex") : path;
  return sanitizeKeyPart(p, 200);
}

export function buildSlidingWindowKeys(
  tag: string,
  userId: string,
  ep: string,
): { k1: string; k2: string; k3: string } {
  const t = sanitizeKeyPart(tag, 48);
  const u = sanitizeKeyPart(userId, 64);
  const e = endpointId(`${t}:${ep}`);
  return {
    k1: `swrl:{${t}}:tenant`,
    k2: `swrl:{${t}}:user:${u}`,
    k3: `swrl:{${t}}:endpoint:${e}`,
  };
}

/** Seconds until the sliding window resets (conservative). */
export function retryAfterSeconds(windowMs: number): number {
  return Math.max(1, Math.ceil(windowMs / 1000));
}

export type RateLimitResult =
  | {
      ok: true;
      c1: number;
      c2: number;
      c3: number;
      m1: number;
      m2: number;
      m3: number;
      w1: number;
      w2: number;
      w3: number;
    }
  | {
      ok: false;
      dim: 1 | 2 | 3;
      c1: number;
      c2: number;
      c3: number;
      m1: number;
      m2: number;
      m3: number;
      wMs: number;
    };

function toNum(x: unknown): number {
  if (typeof x === "number" && !Number.isNaN(x)) {
    return x;
  }
  if (typeof x === "string" && x !== "") {
    return Number(x);
  }
  return 0;
}

/**
 * **EVAL** the sliding-window script (ZREMRANGEBYSCORE, ZADD, ZCARD) on three keys
 * in one **atomic** round trip (works with **Cluster** when keys share the `{tag}`).
 */
export async function runSlidingWindow(
  client: RedisOrCluster,
  keys: { k1: string; k2: string; k3: string },
  limits: {
    w1Ms: number;
    m1: number;
    w2Ms: number;
    m2: number;
    w3Ms: number;
    m3: number;
  },
  nowMs: number,
): Promise<RateLimitResult> {
  const member = `${nowMs}:${randomUUID()}`;
  const out = (await client.eval(
    SLIDING_LUA,
    3,
    keys.k1,
    keys.k2,
    keys.k3,
    String(limits.w1Ms),
    String(limits.m1),
    String(limits.w2Ms),
    String(limits.m2),
    String(limits.w3Ms),
    String(limits.m3),
    String(Math.floor(nowMs)),
    member,
  )) as unknown[];

  const ok = toNum(out[0]) === 1;
  if (ok) {
    return {
      ok: true,
      c1: toNum(out[1]),
      c2: toNum(out[2]),
      c3: toNum(out[3]),
      m1: toNum(out[4]),
      m2: toNum(out[5]),
      m3: toNum(out[6]),
      w1: toNum(out[7]),
      w2: toNum(out[8]),
      w3: toNum(out[9]),
    };
  }
  const dim = toNum(out[1]) as 1 | 2 | 3;
  return {
    ok: false,
    dim: dim === 1 || dim === 2 || dim === 3 ? dim : 1,
    c1: toNum(out[2]),
    c2: toNum(out[3]),
    c3: toNum(out[4]),
    m1: toNum(out[5]),
    m2: toNum(out[6]),
    m3: toNum(out[7]),
    wMs: toNum(out[8]),
  };
}
