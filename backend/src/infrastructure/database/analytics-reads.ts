/**
 * **Reports, CSV exports, BI-style aggregates** — use `getReadConnectionForAnalytics()`.
 * Register models on the returned `Connection` with
 * `conn.model("Name", schema)` when the analytics path is non-`null`.  
 * For normal **CRUD and transactional reads** after a write, use the default
 * `mongoose` connection (primary / `primaryPreferred`) from `getMongooseConnectOptions`.
 */
export { getAnalyticsMongooseConnection as getReadConnectionForAnalytics } from "./mongodb-analytics.js";
