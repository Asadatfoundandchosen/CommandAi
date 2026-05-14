import type { Connection, ConnectOptions } from "mongoose";
import mongoose from "mongoose";

import { config } from "@config/index.js";

/** Bounded staleness for secondary reads; Atlas + driver enforce routing to secondaries that stay within this lag window. */
export const ANALYTICS_MAX_STALENESS_SECONDS = 90;

let analyticsConnection: Connection | null = null;

/**
 * **Reports / exports / heavy analytics** only. Uses `readPreference: secondaryPreferred`
 * and `maxStalenessSeconds` so work is offloaded from the primary.
 * Wires a **separate** URI — use a **read-only** DB user (see `docs/DATABASE.md` and
 * `scripts/mongodb/create-analytics-readonly-user.mongosh.js`).
 */
export function getAnalyticsMongooseConnectOptions(): ConnectOptions {
  const a = config.mongodb.analytics;
  return {
    readPreference: "secondaryPreferred" as const,
    maxStalenessSeconds: a?.maxStalenessSeconds ?? ANALYTICS_MAX_STALENESS_SECONDS,
    retryWrites: false,
    maxPoolSize: a?.maxPoolSize ?? 10,
    minPoolSize: a?.minPoolSize ?? 0,
    maxIdleTimeMS: 30_000,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 120_000,
  } satisfies ConnectOptions;
}

const log = (line: string): void => {
  process.stdout.write(`[mongodb:analytics] ${line}\n`);
};

function wireAnalyticsEvents(conn: Connection): void {
  conn.on("connected", () => {
    log(`connected host=${conn.host ?? "?"}`);
  });
  conn.on("disconnected", () => {
    log("disconnected");
  });
  conn.on("error", (err: Error) => {
    process.stderr.write(`[mongodb:analytics] error: ${err.message}\n`);
  });
  conn.on("reconnected", () => {
    log("reconnected");
  });
  conn.on("close", () => {
    log("close");
  });
}

/**
 * Opens a **second** Mongoose connection. Call only when `MONGODB_ANALYTICS_URI` is set.
 */
export async function connectMongodbAnalytics(): Promise<Connection> {
  const uri = config.mongodb.analytics?.uri;
  if (!uri) {
    throw new Error("connectMongodbAnalytics: MONGODB_ANALYTICS_URI is not configured");
  }
  if (analyticsConnection?.readyState === 1) {
    return analyticsConnection;
  }
  const conn = mongoose.createConnection(uri, getAnalyticsMongooseConnectOptions());
  wireAnalyticsEvents(conn);
  const ready = await conn.asPromise();
  analyticsConnection = ready;
  return ready;
}

/**
 * The analytics / reporting connection, or `null` if not configured or not yet connected.
 */
export function getAnalyticsMongooseConnection(): Connection | null {
  if (analyticsConnection && analyticsConnection.readyState === 1) {
    return analyticsConnection;
  }
  return null;
}

export async function closeMongodbAnalytics(): Promise<void> {
  if (analyticsConnection) {
    await analyticsConnection.close();
    analyticsConnection = null;
  }
}

export function isAnalyticsConnectionConfigured(): boolean {
  return Boolean(config.mongodb.analytics?.uri);
}
