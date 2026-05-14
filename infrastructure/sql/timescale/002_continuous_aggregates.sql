-- TimescaleDB **continuous aggregates** (pre-computed rollups for dashboards).
-- Apply **after** `001_extension_and_hypertables.sql` (requires `signal_metrics` hypertable).
--   psql "$TIMESCALE_DATABASE_URL" -v ON_ERROR_STOP=1 -f 002_continuous_aggregates.sql
--
-- Policies **auto-refresh** materialized data on a schedule (Timescale background jobs).

DROP MATERIALIZED VIEW IF EXISTS signal_metrics_daily CASCADE;
DROP MATERIALIZED VIEW IF EXISTS signal_metrics_hourly CASCADE;

-- Hourly rollup (materialized; refresh policy below)
CREATE MATERIALIZED VIEW signal_metrics_hourly
WITH (timescaledb.continuous) AS
SELECT
  time_bucket(INTERVAL '1 hour', "time") AS bucket,
  org_id,
  agent_id,
  signal_type,
  count(*) AS event_count,
  avg(value) AS avg_value,
  max(value) AS max_value
FROM signal_metrics
GROUP BY bucket, org_id, agent_id, signal_type
WITH NO DATA;

-- Daily rollup
CREATE MATERIALIZED VIEW signal_metrics_daily
WITH (timescaledb.continuous) AS
SELECT
  time_bucket(INTERVAL '1 day', "time") AS bucket,
  org_id,
  agent_id,
  signal_type,
  count(*) AS event_count,
  avg(value) AS avg_value,
  max(value) AS max_value
FROM signal_metrics
GROUP BY bucket, org_id, agent_id, signal_type
WITH NO DATA;

CREATE INDEX IF NOT EXISTS signal_metrics_hourly_org_bucket_idx
  ON signal_metrics_hourly (org_id, bucket DESC);

CREATE INDEX IF NOT EXISTS signal_metrics_hourly_agent_bucket_idx
  ON signal_metrics_hourly (agent_id, bucket DESC);

CREATE INDEX IF NOT EXISTS signal_metrics_daily_org_bucket_idx
  ON signal_metrics_daily (org_id, bucket DESC);

CREATE INDEX IF NOT EXISTS signal_metrics_daily_agent_bucket_idx
  ON signal_metrics_daily (agent_id, bucket DESC);

SELECT add_continuous_aggregate_policy(
  'signal_metrics_hourly',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour'
);

SELECT add_continuous_aggregate_policy(
  'signal_metrics_daily',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day'
);

-- First fill (optional; policies keep aggregates current). Large backfills: pass explicit windows.
-- CALL refresh_continuous_aggregate('signal_metrics_hourly', NULL, NULL);
-- CALL refresh_continuous_aggregate('signal_metrics_daily', NULL, NULL);
