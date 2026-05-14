import type { Registry } from "prom-client";
import { Counter, Gauge } from "prom-client";
import type mongoose from "mongoose";

import { config } from "@config/index.js";

type MongoClient = ReturnType<mongoose.Mongoose["connection"]["getClient"]>;

let pollHandle: ReturnType<typeof setInterval> | undefined;
let clientListenersAttached = false;
let clientForCleanup: MongoClient | null = null;

/**
 * Pool / connection metrics for Prometheus (same scrape as `GET /metrics`).
 * Call after `mongoose.connect` succeeds. Uses CMAP events when available to
 * track **connections in use**; also exports configured min/max and ready state.
 */
export function startMongoPoolMetrics(register: Registry, intervalMs: number): void {
  if (pollHandle) {
    return;
  }

  const readyStateGauge = new Gauge({
    name: "mongodb_mongoose_ready_state",
    help: "Mongoose connection readyState: 0=disconnected, 1=connected, 2=connecting, 3=disconnecting, 99=uninitialized.",
    registers: [register],
  });

  const minGauge = new Gauge({
    name: "mongodb_pool_min_size_config",
    help: "Configured minPoolSize for this process.",
    registers: [register],
  });

  const maxGauge = new Gauge({
    name: "mongodb_pool_max_size_config",
    help: "Configured maxPoolSize for this process.",
    registers: [register],
  });

  const inUseGauge = new Gauge({
    name: "mongodb_pool_connections_in_use",
    help: "Approximate driver connections currently checked out (CMAP; per process).",
    registers: [register],
  });

  const checkout = new Counter({
    name: "mongodb_pool_checkout_total",
    help: "CMAP connection checkouts (monotonic).",
    registers: [register],
  });

  const checkin = new Counter({
    name: "mongodb_pool_checkin_total",
    help: "CMAP connection checkins (monotonic).",
    registers: [register],
  });

  minGauge.set(config.mongodb.minPoolSize);
  maxGauge.set(config.mongodb.maxPoolSize);

  const updateReady = (m: typeof import("mongoose")): void => {
    readyStateGauge.set(m.connection.readyState);
  };

  const attachClientListeners = (m: typeof import("mongoose")): void => {
    if (m.connection.readyState !== 1) {
      return;
    }
    if (clientListenersAttached) {
      return;
    }
    let client: MongoClient;
    try {
      client = m.connection.getClient();
    } catch {
      return;
    }
    clientForCleanup = client;
    client.on("connectionCheckedOut", () => {
      checkout.inc();
      inUseGauge.inc();
    });
    client.on("connectionCheckedIn", () => {
      checkin.inc();
      inUseGauge.dec();
    });
    clientListenersAttached = true;
  };

  const tick = (m: typeof import("mongoose")): void => {
    attachClientListeners(m);
    updateReady(m);
  };

  void import("mongoose").then((m) => {
    tick(m);
  });

  pollHandle = setInterval(() => {
    void import("mongoose").then((m) => {
      tick(m);
    });
  }, intervalMs);
}

export function stopMongoPoolMetrics(): void {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = undefined;
  }
  if (clientForCleanup) {
    try {
      clientForCleanup.removeAllListeners("connectionCheckedOut");
      clientForCleanup.removeAllListeners("connectionCheckedIn");
    } catch {
      /* ignore */
    }
    clientForCleanup = null;
  }
  clientListenersAttached = false;
}
