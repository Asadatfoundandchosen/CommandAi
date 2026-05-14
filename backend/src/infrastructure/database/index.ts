/**
 * Database client factory (MongoDB driver, connection pooling).
 * Implement with official driver or ODM; keep construction out of HTTP handlers.
 */
import { closeMongodbAnalytics } from "./mongodb-analytics.js";
import {
  closeTimescale,
  connectTimescale,
  getTimescalePool,
  insertCreditUsage,
  insertExecutionMetrics,
  insertHitlDecisions,
  insertSignalMetrics,
  isTimescaleConnected,
  querySignalMetricsDailyRange,
  querySignalMetricsHourlyRange,
  querySignalMetricsRange,
} from "./timescale.js";

export { getMongooseConnectOptions, wireMongooseConnectionEvents } from "./mongodb.js";
export {
  connectMongodbAnalytics,
  getAnalyticsMongooseConnection,
  isAnalyticsConnectionConfigured,
  closeMongodbAnalytics,
} from "./mongodb-analytics.js";
export {
  startMongoPoolMetrics,
  stopMongoPoolMetrics,
} from "./mongo-pool-metrics.js";
export { startAnalyticsReadMonitoring, stopAnalyticsReadMonitoring } from "./mongo-analytics-metrics.js";
export { getReadConnectionForAnalytics } from "./analytics-reads.js";
export {
  closeTimescale,
  connectTimescale,
  getTimescalePool,
  insertCreditUsage,
  insertExecutionMetrics,
  insertHitlDecisions,
  insertSignalMetrics,
  isTimescaleConnected,
  querySignalMetricsDailyRange,
  querySignalMetricsHourlyRange,
  querySignalMetricsRange,
};
export type {
  CreditUsageRow,
  ExecutionMetricRow,
  HitlDecisionRow,
  SignalMetricQueryRow,
  SignalMetricRow,
  SignalMetricsRangeParams,
  SignalMetricsRollupRangeParams,
  SignalMetricsRollupRow,
  TimescaleConnectionConfig,
} from "./timescale.js";

export function createDatabasePlaceholder(): { uri: string } {
  return { uri: "not-connected" };
}

let mongoDisconnect: (() => Promise<void>) | null = null;

/** Register when wiring MongoClient / mongoose (e.g. on connect). */
export function registerMongoDisconnect(fn: () => Promise<void>): void {
  mongoDisconnect = fn;
}

/** Called on SIGTERM/SIGINT — closes Timescale pool, analytics pool, then the default connection. */
export async function disconnectMongo(): Promise<void> {
  await closeTimescale();
  await closeMongodbAnalytics();
  if (mongoDisconnect) {
    await mongoDisconnect();
  }
}
