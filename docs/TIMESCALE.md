# TimescaleDB (PostgreSQL 15) — metrics hypertables

## Role

- **Time-series** storage for **signals**, **executions**, **credit usage**, and **HITL decisions** using **TimescaleDB** on **PostgreSQL 15**.
- **Hypertables** partitioned by **`time`** (**1 day** chunks) and **`org_id`** (**hash**, 8 partitions). Full column layout: **`docs/TIMESCALE_SCHEMA.md`**.
- SQL bootstrap: **`infrastructure/sql/timescale/001_extension_and_hypertables.sql`**.
- Application access: **`backend/src/infrastructure/database/timescale.ts`** (`pg` **Pool**, batch inserts + signal range queries).

## Terraform (RDS)

- Reusable module: **`infrastructure/terraform/modules/rds-timescale-postgres/`**
  - **Engine**: `postgres` **15.x** (`engine_version` variable, default `15.8`).
  - **Instance**: default **`db.r6g.large`** (override via `instance_class`).
  - **Multi-AZ**: `multi_az = true` (default).
  - **Encryption**: `storage_encrypted = true` (optional CMK via `kms_key_id`).
  - **Timescale preload**: custom **`aws_db_parameter_group`** with `shared_preload_libraries = timescaledb` (`apply_method = pending-reboot`). Set `timescaledb_shared_preload = false` if your region/engine rejects it.
- Example root module: **`infrastructure/terraform/environments/timescale-rds/`** — copy **`terraform.tfvars.example`** → **`terraform.tfvars`**, then `terraform init && terraform apply`.

## Extension and schema

After RDS is **available** (and after any **reboot** from parameter-group apply):

```bash
psql "$TIMESCALE_DATABASE_URL" -v ON_ERROR_STOP=1 -f infrastructure/sql/timescale/001_extension_and_hypertables.sql
```

This runs `CREATE EXTENSION IF NOT EXISTS timescaledb;`, creates **four** hypertables (`signal_metrics`, `execution_metrics`, `credit_usage`, `hitl_decisions`), adds **`org_id`** space dimensions, and creates indexes.

### Continuous aggregates (dashboards)

After **`001_...`**, apply **`infrastructure/sql/timescale/002_continuous_aggregates.sql`** for **`signal_metrics_hourly`** / **`signal_metrics_daily`** with **auto-refresh** policies. See **`docs/TIMESCALE_CONTINUOUS_AGGREGATES.md`**.

### Compression, retention, and S3 archive

After **`001`** (and optionally **`002`**), apply **`infrastructure/sql/timescale/003_compression_retention.sql`** to enable **compression** (after **7 days**, segment by **`org_id`**, **`agent_id`**) and **retention** (drop raw chunks after **90 days**). **S3** export is **not** built into Timescale: use a **scheduled** job (see **`scripts/timescale/archive-signal-metrics-to-s3.sh`**) and **`docs/TIMESCALE_DATA_LIFECYCLE.md`**.

## Vault (credentials)

Do **not** commit database passwords or full URIs to git.

1. After `terraform apply`, read **`master_password`** (sensitive output) once:  
   `terraform output -raw master_password`
2. Write to **HashiCorp Vault** KV v2, for example:
   - Path: `secret/data/databases/timescale/1commandai`
   - Keys: `host`, `port`, `database`, `username`, `password`, or a single **`database_url`** / **`TIMESCALE_DATABASE_URL`** for the app.
3. At deploy time, inject **`TIMESCALE_DATABASE_URL`** into the API workload (Kubernetes **External Secrets** operator → Vault, or your CD pipeline).

## Application configuration

- **`TIMESCALE_DATABASE_URL`** — PostgreSQL URI (use `sslmode=require` against RDS).
- **`TIMESCALE_POOL_MIN`** / **`TIMESCALE_POOL_MAX`** — optional pool bounds (defaults `0` / `20`).
- If the URL is **unset**, Timescale is **disabled** (no pool; `connectTimescale` is not called).

## Related

- **`backend/src/server.ts`** — connects when `config.timescale` is set.
- **`disconnectMongo()`** — closes the Timescale pool before Mongo analytics and the primary Mongoose connection.
