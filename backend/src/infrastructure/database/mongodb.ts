import type { ConnectOptions } from "mongoose";

import { config } from "@config/index.js";

/**
 * Mongoose / driver connection options.
 * Pool bounds are **10–50** by default; tune per environment (e.g. lower `max` when
 * many replicas) so **total** connections to Atlas stay within cluster limits
 * (replicas × maxPoolSize × pod count).
 */
export function getMongooseConnectOptions(): ConnectOptions {
  return {
    readPreference: "primaryPreferred" as const,
    retryWrites: true,
    writeConcern: { w: "majority" as const, wtimeoutMS: 5000 },
    maxPoolSize: config.mongodb.maxPoolSize,
    minPoolSize: config.mongodb.minPoolSize,
    maxIdleTimeMS: 30_000,
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
  } satisfies ConnectOptions;
}

const connectionLog = (msg: string, extra?: string): void => {
  const line = extra ? `${msg} ${extra}\n` : `${msg}\n`;
  process.stdout.write(`[mongodb] ${line}`);
};

let eventsWired = false;

/**
 * Register once before `mongoose.connect` so early lifecycle events are observed.
 */
export function wireMongooseConnectionEvents(mongoose: typeof import("mongoose")): void {
  if (eventsWired) {
    return;
  }
  eventsWired = true;
  const c = mongoose.connection;
  c.on("connected", () => {
    connectionLog("connected", `host=${c.host ?? "?"}`);
  });
  c.on("open", () => {
    connectionLog("open (socket ready)");
  });
  c.on("disconnected", () => {
    connectionLog("disconnected");
  });
  c.on("error", (err: Error) => {
    process.stderr.write(`[mongodb] error: ${err.message}\n`);
  });
  c.on("reconnected", () => {
    connectionLog("reconnected");
  });
  c.on("close", () => {
    connectionLog("close");
  });
}
