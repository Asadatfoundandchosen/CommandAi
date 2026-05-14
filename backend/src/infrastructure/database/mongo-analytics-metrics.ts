import type { Registry } from "prom-client";
import { Counter, Gauge, Histogram } from "prom-client";

import { config } from "@config/index.js";
import { ANALYTICS_MAX_STALENESS_SECONDS, getAnalyticsMongooseConnection } from "./mongodb-analytics.js";

let intervalHandle: ReturnType<typeof setInterval> | undefined;

/**
 * Exposes **analytics** connection readiness, configured staleness cap, and a periodic
 * **read probe** RTT to the secondary-preferred path (not the same as MongoDB
 * `metrics.repl` lag — for authoritative replication lag, use **Atlas** metrics).
 */
export function startAnalyticsReadMonitoring(
  register: Registry,
  intervalMs: number,
): void {
  if (intervalHandle) {
    return;
  }
  if (!config.mongodb.analytics?.uri) {
    return;
  }

  new Gauge({
    name: "mongodb_analytics_max_staleness_seconds_config",
    help: "readPreference maxStalenessSeconds bound (driver may refuse stale secondaries outside this window).",
    registers: [register],
  }).set(
    config.mongodb.analytics.maxStalenessSeconds ?? ANALYTICS_MAX_STALENESS_SECONDS,
  );

  const readyGauge = new Gauge({
    name: "mongodb_analytics_connection_ready",
    help: "1 if analytics Mongoose connection is readyState=connected, else 0.",
    registers: [register],
  });

  const successGauge = new Gauge({
    name: "mongodb_analytics_read_probe_success",
    help: "1 if last read probe to analytics DB (admin ping) succeeded, else 0.",
    registers: [register],
  });

  const duration = new Histogram({
    name: "mongodb_analytics_read_probe_duration_seconds",
    help: "Round-trip time of admin.ping on the analytics (secondaryPreferred) connection — sanity check, not replication lag.",
    labelNames: ["outcome"],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2],
    registers: [register],
  });

  const probeTotal = new Counter({
    name: "mongodb_analytics_read_probe_total",
    help: "Count of read probes run against the analytics connection.",
    registers: [register],
  });

  const runProbe = async (): Promise<void> => {
    const conn = getAnalyticsMongooseConnection();
    if (!conn) {
      readyGauge.set(0);
      successGauge.set(0);
      return;
    }
    if (conn.readyState !== 1) {
      readyGauge.set(0);
      successGauge.set(0);
      return;
    }
    readyGauge.set(1);
    const db = conn.db;
    if (!db) {
      successGauge.set(0);
      return;
    }
    probeTotal.inc();
    const start = process.hrtime.bigint();
    try {
      await db.admin().ping();
      const sec = Number(process.hrtime.bigint() - start) / 1_000_000_000;
      successGauge.set(1);
      duration.observe({ outcome: "ok" }, sec);
    } catch {
      const sec = Number(process.hrtime.bigint() - start) / 1_000_000_000;
      successGauge.set(0);
      duration.observe({ outcome: "error" }, sec);
    }
  };

  void runProbe();
  intervalHandle = setInterval(() => {
    void runProbe();
  }, intervalMs);
}

export function stopAnalyticsReadMonitoring(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = undefined;
  }
}
