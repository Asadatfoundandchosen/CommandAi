-- TimescaleDB: extension + metrics hypertables (time range **1 day** + **org_id** space partition).
-- Run after RDS is available (and after any reboot from `shared_preload_libraries`), e.g.:
--   psql "$TIMESCALE_DATABASE_URL" -v ON_ERROR_STOP=1 -f 001_extension_and_hypertables.sql
--
-- `add_dimension` must run while the hypertable is still **empty** (before bulk loads).

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Replace legacy shapes (breaking change from text-key signal_metrics).
DROP TABLE IF EXISTS hitl_decisions CASCADE;
DROP TABLE IF EXISTS credit_usage CASCADE;
DROP TABLE IF EXISTS execution_metrics CASCADE;
DROP TABLE IF EXISTS signal_metrics CASCADE;

-- Signal metrics (operator shape + surrogate key for hypertable PK rules)
CREATE TABLE signal_metrics (
  "time" timestamptz NOT NULL,
  org_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  signal_type text,
  severity text,
  value double precision,
  metadata jsonb DEFAULT '{}'::jsonb,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT signal_metrics_pkey PRIMARY KEY ("time", org_id, id)
);

SELECT create_hypertable(
  'signal_metrics',
  'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

SELECT add_dimension(
  'signal_metrics',
  'org_id',
  number_partitions => 8,
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS signal_metrics_org_time_desc_idx
  ON signal_metrics (org_id, "time" DESC);

CREATE INDEX IF NOT EXISTS signal_metrics_agent_time_desc_idx
  ON signal_metrics (agent_id, "time" DESC);

-- Execution pipeline metrics
CREATE TABLE execution_metrics (
  "time" timestamptz NOT NULL,
  org_id uuid NOT NULL,
  execution_id uuid NOT NULL,
  agent_id uuid,
  metric_name text NOT NULL,
  value double precision NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT execution_metrics_pkey PRIMARY KEY ("time", org_id, execution_id, metric_name)
);

SELECT create_hypertable(
  'execution_metrics',
  'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

SELECT add_dimension(
  'execution_metrics',
  'org_id',
  number_partitions => 8,
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS execution_metrics_org_time_desc_idx
  ON execution_metrics (org_id, "time" DESC);

-- Credit consumption (billing / quotas)
CREATE TABLE credit_usage (
  "time" timestamptz NOT NULL,
  org_id uuid NOT NULL,
  account_id uuid NOT NULL,
  credits numeric(24, 8) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT credit_usage_pkey PRIMARY KEY ("time", org_id, id)
);

SELECT create_hypertable(
  'credit_usage',
  'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

SELECT add_dimension(
  'credit_usage',
  'org_id',
  number_partitions => 8,
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS credit_usage_org_time_desc_idx
  ON credit_usage (org_id, "time" DESC);

CREATE INDEX IF NOT EXISTS credit_usage_account_time_desc_idx
  ON credit_usage (account_id, "time" DESC);

-- Human-in-the-loop approvals / overrides
CREATE TABLE hitl_decisions (
  "time" timestamptz NOT NULL,
  org_id uuid NOT NULL,
  decision_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  approved boolean NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT hitl_decisions_pkey PRIMARY KEY ("time", org_id, decision_id)
);

SELECT create_hypertable(
  'hitl_decisions',
  'time',
  chunk_time_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

SELECT add_dimension(
  'hitl_decisions',
  'org_id',
  number_partitions => 8,
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS hitl_decisions_org_time_desc_idx
  ON hitl_decisions (org_id, "time" DESC);

CREATE INDEX IF NOT EXISTS hitl_decisions_agent_time_desc_idx
  ON hitl_decisions (agent_id, "time" DESC);
