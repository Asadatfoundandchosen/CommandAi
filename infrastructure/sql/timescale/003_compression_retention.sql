-- Compression + data retention for **`signal_metrics`** (apply after `001` and `002`).
--   psql "$TIMESCALE_DATABASE_URL" -v ON_ERROR_STOP=1 -f 003_compression_retention.sql
--
-- **Archive to S3** is *not* SQL-native: run a scheduled job (see `docs/TIMESCALE_DATA_LIFECYCLE.md`)
-- so cold data is exported **before** chunks are dropped by retention.

SELECT remove_compression_policy('signal_metrics', if_exists => true);
SELECT remove_retention_policy('signal_metrics', if_exists => true);

ALTER TABLE signal_metrics SET (
  timescaledb.compress,
  timescaledb.compress_orderby = 'time DESC',
  timescaledb.compress_segmentby = 'org_id, agent_id'
);

-- Compress chunk data older than 7 days (background worker)
SELECT add_compression_policy(
  'signal_metrics',
  compress_after => INTERVAL '7 days'
);

-- Drop raw chunks fully older than 90 days (pair with S3 archive job — see data lifecycle doc)
SELECT add_retention_policy(
  'signal_metrics',
  drop_after => INTERVAL '90 days'
);
