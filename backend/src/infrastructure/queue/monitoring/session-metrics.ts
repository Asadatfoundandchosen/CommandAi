import { Gauge, type Registry } from "prom-client";

import { config } from "@config/index.js";
import { getRedisClient } from "../../cache/redis-client.js";
import { countSessionKeys } from "../../cache/session-key-enumeration.js";

let pollHandle: ReturnType<typeof setInterval> | undefined;

/**
 * Gauge `express_session_active_count` on the shared `/metrics` registry.
 * Refreshed on the same interval as queue depth (CPU-light; uses SCAN on all primaries in Cluster).
 */
export function startSessionMetrics(register: Registry, intervalMs: number): void {
  if (pollHandle) {
    return;
  }
  const expressSessionActive = new Gauge({
    name: "express_session_active_count",
    help: "Number of express-session keys in Redis (prefix from connect-redis; cluster = scan all primaries).",
    registers: [register],
  });

  async function tick(): Promise<void> {
    const client = getRedisClient();
    if (!client) {
      expressSessionActive.set(0);
      return;
    }
    try {
      const n = await countSessionKeys(client, config.session.redisKeyPrefix);
      expressSessionActive.set(n);
    } catch {
      expressSessionActive.set(0);
    }
  }

  void tick().catch(() => {
    expressSessionActive.set(0);
  });
  pollHandle = setInterval(() => {
    void tick().catch(() => {
      expressSessionActive.set(0);
    });
  }, intervalMs);
}

export function stopSessionMetrics(): void {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = undefined;
  }
}
