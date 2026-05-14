# TimescaleDB continuous aggregates (dashboard rollups)

Pre-computed **hourly** and **daily** rollups over raw **`signal_metrics`** so dashboard APIs read small, materialized ranges instead of scanning the hypertable.

## Apply

Requires **`001_extension_and_hypertables.sql`** applied first.

```bash
psql "$TIMESCALE_DATABASE_URL" -v ON_ERROR_STOP=1 -f infrastructure/sql/timescale/002_continuous_aggregates.sql
```

The script **drops** existing aggregate views (if present), recreates them, adds **indexes** on `(org_id, bucket DESC)` and `(agent_id, bucket DESC)`, then registers **auto-refresh** policies.

## Views

### `signal_metrics_hourly`

| Column        | Type           | Description |
|---------------|----------------|-------------|
| `bucket`      | `timestamptz`  | Start of `time_bucket(1 hour, time)`. |
| `org_id`      | `uuid`         | Tenant. |
| `agent_id`    | `uuid`         | Agent. |
| `signal_type` | `text`         | Nullable dimension (same as raw). |
| `event_count` | `bigint`       | `count(*)` (SQL uses name `event_count` to avoid reserved-word friction). |
| `avg_value`   | `double precision` | `avg(value)` |
| `max_value`   | `double precision` | `max(value)` |

### `signal_metrics_daily`

Same columns, with `time_bucket(1 day, time)` as `bucket`.

## Auto-refresh (materialized + scheduled)

| View | Policy | Meaning |
|------|--------|---------|
| `signal_metrics_hourly` | `start_offset => 3 hours`, `end_offset => 1 hour`, `schedule_interval => 1 hour` | Refreshes a sliding window so recent hours stay current. |
| `signal_metrics_daily` | `start_offset => 3 days`, `end_offset => 1 day`, `schedule_interval => 1 day` | Daily rollup refresh. |

Timescale’s **background worker** runs these policies; ensure the TimescaleDB extension is loaded and the job scheduler is active on your deployment (default on RDS when the extension is enabled).

## Optional backfill

For large historical ranges, uncomment or run windowed refreshes (see Timescale `refresh_continuous_aggregate` / `CALL refresh_continuous_aggregate` docs) instead of a single full refresh.

## Application helpers

`backend/src/infrastructure/database/timescale.ts`:

- **`querySignalMetricsHourlyRange`**
- **`querySignalMetricsDailyRange`**

Both filter by **`org_id`** + **`bucket`** range, optional **`agentId`** / **`signalType`**, and a capped **`limit`**.

## Related

- Raw hypertable schema: **`docs/TIMESCALE_SCHEMA.md`**
- Connection / env: **`docs/TIMESCALE.md`**
- Compression / retention / S3 lifecycle: **`docs/TIMESCALE_DATA_LIFECYCLE.md`**
