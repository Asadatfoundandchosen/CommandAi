import { config } from "@config/index.js";
import { pgSslOptions } from "@config/tls-policy.js";
import pg from "pg";

const { Pool } = pg;

export type TimescaleConnectionConfig = {
  connectionString: string;
  minPoolSize: number;
  maxPoolSize: number;
};

/** One row in `signal_metrics` (see `docs/TIMESCALE_SCHEMA.md`). */
export type SignalMetricRow = {
  time: Date;
  orgId: string;
  agentId: string;
  signalType?: string | null;
  severity?: string | null;
  value?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type SignalMetricQueryRow = {
  time: Date;
  org_id: string;
  agent_id: string;
  signal_type: string | null;
  severity: string | null;
  value: number | null;
  metadata: Record<string, unknown>;
  id: string;
};

export type ExecutionMetricRow = {
  time: Date;
  orgId: string;
  executionId: string;
  agentId?: string | null;
  metricName: string;
  value: number;
  metadata?: Record<string, unknown>;
};

export type CreditUsageRow = {
  time: Date;
  orgId: string;
  accountId: string;
  credits: string;
  metadata?: Record<string, unknown>;
};

export type HitlDecisionRow = {
  time: Date;
  orgId: string;
  decisionId: string;
  agentId: string;
  approved: boolean;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

let pool: pg.Pool | null = null;

export function isTimescaleConnected(): boolean {
  return pool !== null;
}

/**
 * Opens a **pg** pool to TimescaleDB / PostgreSQL 15 (optional — only when `TIMESCALE_DATABASE_URL` is set).
 */
export async function connectTimescale(
  cfg: TimescaleConnectionConfig,
): Promise<pg.Pool> {
  if (pool) {
    return pool;
  }
  const ssl = pgSslOptions(config.env);
  const next = new Pool({
    connectionString: cfg.connectionString,
    min: cfg.minPoolSize,
    max: cfg.maxPoolSize,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
    ...(ssl ? { ssl } : {}),
  });
  await next.query("SELECT 1");
  pool = next;
  process.stdout.write("[timescale] pool connected\n");
  return next;
}

export function getTimescalePool(): pg.Pool | null {
  return pool;
}

/** Best-effort close on shutdown (after HTTP drain). */
export async function closeTimescale(): Promise<void> {
  if (!pool) {
    return;
  }
  const p = pool;
  pool = null;
  await p.end();
  process.stdout.write("[timescale] pool closed\n");
}

function assertPool(): pg.Pool {
  const p = pool;
  if (!p) {
    throw new Error("TimescaleDB pool is not connected (set TIMESCALE_DATABASE_URL)");
  }
  return p;
}

/**
 * Batch insert into **`signal_metrics`** (time + **org_id** hash partitions).
 */
export async function insertSignalMetrics(rows: SignalMetricRow[]): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }
  const p = assertPool();
  const cols = 7;
  const placeholders: string[] = [];
  const params: unknown[] = [];
  let n = 1;
  for (const r of rows) {
    placeholders.push(
      `($${n}, $${n + 1}::uuid, $${n + 2}::uuid, $${n + 3}, $${n + 4}, $${n + 5}, $${n + 6}::jsonb)`,
    );
    n += cols;
    params.push(
      r.time,
      r.orgId,
      r.agentId,
      r.signalType ?? null,
      r.severity ?? null,
      r.value ?? null,
      JSON.stringify(r.metadata ?? {}),
    );
  }
  const sql = `INSERT INTO signal_metrics ("time", org_id, agent_id, signal_type, severity, value, metadata) VALUES ${placeholders.join(", ")}`;
  const res = await p.query(sql, params);
  return res.rowCount ?? rows.length;
}

export async function insertExecutionMetrics(rows: ExecutionMetricRow[]): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }
  const p = assertPool();
  const cols = 7;
  const placeholders: string[] = [];
  const params: unknown[] = [];
  let n = 1;
  for (const r of rows) {
    placeholders.push(
      `($${n}, $${n + 1}::uuid, $${n + 2}::uuid, $${n + 3}::uuid, $${n + 4}, $${n + 5}, $${n + 6}::jsonb)`,
    );
    n += cols;
    params.push(
      r.time,
      r.orgId,
      r.executionId,
      r.agentId ?? null,
      r.metricName,
      r.value,
      JSON.stringify(r.metadata ?? {}),
    );
  }
  const sql = `INSERT INTO execution_metrics ("time", org_id, execution_id, agent_id, metric_name, value, metadata) VALUES ${placeholders.join(", ")}`;
  const res = await p.query(sql, params);
  return res.rowCount ?? rows.length;
}

export async function insertCreditUsage(rows: CreditUsageRow[]): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }
  const p = assertPool();
  const cols = 5;
  const placeholders: string[] = [];
  const params: unknown[] = [];
  let n = 1;
  for (const r of rows) {
    placeholders.push(
      `($${n}, $${n + 1}::uuid, $${n + 2}::uuid, $${n + 3}::numeric, $${n + 4}::jsonb)`,
    );
    n += cols;
    params.push(r.time, r.orgId, r.accountId, r.credits, JSON.stringify(r.metadata ?? {}));
  }
  const sql = `INSERT INTO credit_usage ("time", org_id, account_id, credits, metadata) VALUES ${placeholders.join(", ")}`;
  const res = await p.query(sql, params);
  return res.rowCount ?? rows.length;
}

export async function insertHitlDecisions(rows: HitlDecisionRow[]): Promise<number> {
  if (rows.length === 0) {
    return 0;
  }
  const p = assertPool();
  const cols = 7;
  const placeholders: string[] = [];
  const params: unknown[] = [];
  let n = 1;
  for (const r of rows) {
    placeholders.push(
      `($${n}, $${n + 1}::uuid, $${n + 2}::uuid, $${n + 3}::uuid, $${n + 4}, $${n + 5}, $${n + 6}::jsonb)`,
    );
    n += cols;
    params.push(
      r.time,
      r.orgId,
      r.decisionId,
      r.agentId,
      r.approved,
      r.reason ?? null,
      JSON.stringify(r.metadata ?? {}),
    );
  }
  const sql = `INSERT INTO hitl_decisions ("time", org_id, decision_id, agent_id, approved, reason, metadata) VALUES ${placeholders.join(", ")}`;
  const res = await p.query(sql, params);
  return res.rowCount ?? rows.length;
}

export type SignalMetricsRangeParams = {
  orgId: string;
  from: Date;
  to: Date;
  agentId?: string;
  limit?: number;
};

/**
 * Range query on **`signal_metrics`** (tenant `org_id` + time window; optional `agent_id`).
 */
export async function querySignalMetricsRange(
  params: SignalMetricsRangeParams,
): Promise<SignalMetricQueryRow[]> {
  const p = assertPool();
  const limit = Math.min(Math.max(params.limit ?? 500, 1), 10_000);
  const hasAgent = params.agentId !== undefined && params.agentId !== "";
  const sql = hasAgent
    ? `SELECT "time", org_id::text, agent_id::text, signal_type, severity, value, metadata, id::text
        FROM signal_metrics
        WHERE org_id = $1::uuid AND "time" >= $2 AND "time" < $3 AND agent_id = $4::uuid
        ORDER BY "time" DESC
        LIMIT $5`
    : `SELECT "time", org_id::text, agent_id::text, signal_type, severity, value, metadata, id::text
        FROM signal_metrics
        WHERE org_id = $1::uuid AND "time" >= $2 AND "time" < $3
        ORDER BY "time" DESC
        LIMIT $4`;
  const values = hasAgent
    ? [params.orgId, params.from, params.to, params.agentId, limit]
    : [params.orgId, params.from, params.to, limit];
  const res = await p.query<SignalMetricQueryRow>(sql, values);
  return res.rows.map((row) => ({
    ...row,
    metadata:
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {},
  }));
}

/** Pre-computed continuous aggregate row (`signal_metrics_hourly` / `signal_metrics_daily`). */
export type SignalMetricsRollupRow = {
  bucket: Date;
  org_id: string;
  agent_id: string;
  signal_type: string | null;
  event_count: number;
  avg_value: number | null;
  max_value: number | null;
};

export type SignalMetricsRollupRangeParams = {
  orgId: string;
  from: Date;
  to: Date;
  agentId?: string;
  signalType?: string | null;
  limit?: number;
};

function mapRollupRow(r: Record<string, unknown>): SignalMetricsRollupRow {
  return {
    bucket: r.bucket as Date,
    org_id: String(r.org_id),
    agent_id: String(r.agent_id),
    signal_type: r.signal_type === null || r.signal_type === undefined ? null : String(r.signal_type),
    event_count: Number(r.event_count),
    avg_value: r.avg_value === null || r.avg_value === undefined ? null : Number(r.avg_value),
    max_value: r.max_value === null || r.max_value === undefined ? null : Number(r.max_value),
  };
}

async function querySignalMetricsRollup(
  table: "signal_metrics_hourly" | "signal_metrics_daily",
  params: SignalMetricsRollupRangeParams,
): Promise<SignalMetricsRollupRow[]> {
  const p = assertPool();
  const limit = Math.min(Math.max(params.limit ?? 500, 1), 10_000);
  const values: unknown[] = [params.orgId, params.from, params.to];
  let n = 4;
  let sql = `SELECT bucket, org_id::text, agent_id::text, signal_type, event_count, avg_value, max_value
    FROM ${table}
    WHERE org_id = $1::uuid AND bucket >= $2 AND bucket < $3`;
  if (params.agentId !== undefined && params.agentId !== "") {
    sql += ` AND agent_id = $${n}::uuid`;
    values.push(params.agentId);
    n += 1;
  }
  if (params.signalType !== undefined) {
    if (params.signalType === null) {
      sql += ` AND signal_type IS NULL`;
    } else {
      sql += ` AND signal_type = $${n}`;
      values.push(params.signalType);
      n += 1;
    }
  }
  sql += ` ORDER BY bucket DESC LIMIT $${n}`;
  values.push(limit);
  const res = await p.query<Record<string, unknown>>(sql, values);
  return res.rows.map(mapRollupRow);
}

/** Dashboard query: **hourly** continuous aggregate. */
export async function querySignalMetricsHourlyRange(
  params: SignalMetricsRollupRangeParams,
): Promise<SignalMetricsRollupRow[]> {
  return querySignalMetricsRollup("signal_metrics_hourly", params);
}

/** Dashboard query: **daily** continuous aggregate. */
export async function querySignalMetricsDailyRange(
  params: SignalMetricsRollupRangeParams,
): Promise<SignalMetricsRollupRow[]> {
  return querySignalMetricsRollup("signal_metrics_daily", params);
}

export type CreditUsageByAccountRow = {
  account_id: string;
  usage_type: string;
  amount: number;
};

/** Credit consumption grouped by account and usage type since `from`. */
export async function queryCreditUsageByAccountSince(
  orgId: string,
  from: Date,
): Promise<CreditUsageByAccountRow[]> {
  const p = assertPool();
  const sql = `SELECT account_id::text AS account_id,
      COALESCE(NULLIF(metadata->>'type', ''), NULLIF(metadata->>'usage_type', ''), 'other') AS usage_type,
      SUM(credits)::float AS amount
    FROM credit_usage
    WHERE org_id = $1::uuid AND "time" >= $2
    GROUP BY account_id, usage_type
    ORDER BY account_id, usage_type`;
  const res = await p.query<CreditUsageByAccountRow>(sql, [orgId, from]);
  return res.rows.map((r) => ({
    account_id: String(r.account_id),
    usage_type: String(r.usage_type),
    amount: Number(r.amount),
  }));
}

export type CreditUsageTrendRow = {
  bucket: Date;
  total: number;
};

/** Daily credit usage trend for dashboard charts. */
export async function queryCreditUsageTrendDaily(
  orgId: string,
  from: Date,
  to: Date,
): Promise<CreditUsageTrendRow[]> {
  const p = assertPool();
  const sql = `SELECT time_bucket('1 day', "time") AS bucket,
      SUM(credits)::float AS total
    FROM credit_usage
    WHERE org_id = $1::uuid AND "time" >= $2 AND "time" < $3
    GROUP BY bucket
    ORDER BY bucket ASC`;
  const res = await p.query<{ bucket: Date; total: string | number }>(sql, [
    orgId,
    from,
    to,
  ]);
  return res.rows.map((r) => ({
    bucket: r.bucket,
    total: Number(r.total),
  }));
}
