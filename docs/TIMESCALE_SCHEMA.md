# TimescaleDB metrics schema

Hypertables are **partitioned by `time`** (range chunks, **interval 1 day**) and **`org_id`** (**space / hash**, **8 partitions**) so tenant data spreads across chunks and hash buckets for even load and isolation-friendly pruning.

Apply with:

```bash
psql "$TIMESCALE_DATABASE_URL" -v ON_ERROR_STOP=1 -f infrastructure/sql/timescale/001_extension_and_hypertables.sql
```

> The migration **drops** the listed metrics tables if they exist (dev / controlled upgrades). For production upgrades with data, use a forward migration path instead of blind `DROP`.

---

## `signal_metrics`

Per-signal measurements and classifications.

| Column        | Type           | Notes |
|---------------|----------------|--------|
| `time`        | `timestamptz`  | Hypertable time dimension (PK part). |
| `org_id`      | `uuid`         | Tenant; space partition + PK part. |
| `agent_id`    | `uuid`         | Emitting agent. |
| `signal_type` | `text`         | Nullable category. |
| `severity`    | `text`         | Nullable level / label. |
| `value`       | `double precision` | Nullable numeric payload. |
| `metadata`    | `jsonb`        | Default `{}`. |
| `id`          | `uuid`         | Default `gen_random_uuid()`; PK with `time`, `org_id`. |

**Hypertable:** `create_hypertable(..., 'time', chunk_time_interval => interval '1 day')` then `add_dimension(..., 'org_id', number_partitions => 8)`.

**Indexes:** `(org_id, time DESC)`, `(agent_id, time DESC)`.

**TypeScript:** `insertSignalMetrics`, `querySignalMetricsRange` in `backend/src/infrastructure/database/timescale.ts`.

---

## `execution_metrics`

Pipeline / run-level metrics (latency, tokens, step counts, etc.).

| Column         | Type           | Notes |
|----------------|----------------|--------|
| `time`         | `timestamptz`  | Event time. |
| `org_id`       | `uuid`         | Tenant; hash dimension. |
| `execution_id` | `uuid`         | Run identifier. |
| `agent_id`     | `uuid`         | Nullable. |
| `metric_name`  | `text`         | e.g. `latency_ms`, `tokens_out`. |
| `value`        | `double precision` | Measurement. |
| `metadata`     | `jsonb`        | Default `{}`. |

**Primary key:** `(time, org_id, execution_id, metric_name)` — satisfies hypertable uniqueness including `time` and `org_id`.

**Hypertable / dimension / index:** Same **1 day** + **`org_id`** hash pattern; index `(org_id, time DESC)`.

**TypeScript:** `insertExecutionMetrics`.

---

## `credit_usage`

Credit consumption for billing and quotas.

| Column      | Type           | Notes |
|-------------|----------------|--------|
| `time`      | `timestamptz`  | Posting time. |
| `org_id`    | `uuid`         | Tenant; hash dimension. |
| `account_id`| `uuid`         | Business unit / account. |
| `credits`   | `numeric(24,8)`| Amount consumed (signed if you encode refunds). |
| `metadata`  | `jsonb`        | Default `{}`. |
| `id`        | `uuid`         | Surrogate key; PK `(time, org_id, id)`. |

**Hypertable / dimension:** Same pattern.

**Indexes:** `(org_id, time DESC)`, `(account_id, time DESC)`.

**TypeScript:** `insertCreditUsage` (pass `credits` as a decimal **string** to preserve precision).

---

## `hitl_decisions`

Human-in-the-loop approvals, rejections, or overrides.

| Column        | Type           | Notes |
|---------------|----------------|--------|
| `time`        | `timestamptz`  | Decision timestamp. |
| `org_id`      | `uuid`         | Tenant; hash dimension. |
| `decision_id` | `uuid`         | Idempotent id for the decision row. |
| `agent_id`    | `uuid`         | Subject agent. |
| `approved`    | `boolean`      | Outcome. |
| `reason`      | `text`         | Nullable explanation. |
| `metadata`    | `jsonb`        | Default `{}`. |

**Primary key:** `(time, org_id, decision_id)`.

**Hypertable / dimension:** Same pattern.

**Indexes:** `(org_id, time DESC)`, `(agent_id, time DESC)`.

**TypeScript:** `insertHitlDecisions`.

---

## Continuous aggregates

**Hourly** and **daily** materialized rollups over `signal_metrics` (`signal_metrics_hourly`, `signal_metrics_daily`) with **auto-refresh** policies are in **`infrastructure/sql/timescale/002_continuous_aggregates.sql`**. Column layout and refresh windows: **`docs/TIMESCALE_CONTINUOUS_AGGREGATES.md`**. TypeScript: **`querySignalMetricsHourlyRange`**, **`querySignalMetricsDailyRange`** in `timescale.ts`.

---

## Design notes

1. **`org_id` in partitioning:** Hash dimension on `org_id` complements time chunking so multi-tenant bulk loads distribute across space partitions; queries filtered by `org_id` still benefit from `(org_id, time)` indexes.
2. **Surrogate keys** where the natural key is not unique per `(time, org_id)` (`signal_metrics`, `credit_usage`).
3. **Credentials:** Store connection strings in **Vault**; see `docs/TIMESCALE.md`.
4. **Lifecycle (compress / retention / S3):** **`infrastructure/sql/timescale/003_compression_retention.sql`** and **`docs/TIMESCALE_DATA_LIFECYCLE.md`**.
