# Time-series data lifecycle (compression, retention, S3 archive)

This document describes how **1CommandAI** controls **cost** and **compliance** for TimescaleDB metrics: **compress** recent cold data, **archive** to **S3** before irreversible **deletes**, and **retain** raw hypertable data for a fixed window.

## Policy summary (raw `signal_metrics`)

| Stage | When | Mechanism |
|--------|------|-----------|
| **Compress** | Chunks with data older than **7 days** | `timescaledb.compress` + `add_compression_policy(..., compress_after => interval '7 days')` — see `infrastructure/sql/timescale/003_compression_retention.sql` |
| **Drop (retention)** | Chunks fully older than **90 days** | `add_retention_policy(..., drop_after => interval '90 days')` |
| **Archive** | **Before** chunks are dropped | **External** job (not Timescale built-in) exports Parquet/CSV to **S3**; schedule must complete **before** the retention job removes data you still need in object storage |

**System context:** *Compress after 7 days. Drop after 90 days. Archive to S3 before drop.*

## Why S3 is not in SQL

TimescaleDB **retention** runs as a **background job** and **drops** old **chunks**; there is **no** server-side “before delete, export to S3” hook in standard Timescale. You implement **archive** as:

1. A **scheduled** process (Kubernetes **CronJob**, **Lambda** + EventBridge, **Step Functions**, **GitHub Actions**, etc.) that:
   - Identifies time ranges or chunk boundaries to archive (e.g. query `timescaledb_information.chunks` for `signal_metrics`), **or** exports by `time` window.
   - Writes **Parquet** (preferred for Athena / Spark) or **CSV** (simpler) to a staging path.
   - **Uploads** to **S3** with a prefix such as `s3://<bucket>/timescale/signal_metrics/dt=YYYY-MM-DD/`.
2. **Tuning:** Run the archive job **more often** than retention, and target data **slightly older** than the retention cut (e.g. export windows that will be dropped on the **next** retention pass) so a failed archive can be retried before data is gone.
3. **Buffer:** Optionally set `drop_after` **longer** than 90d in non-prod until the archive path is proven (e.g. 100d drop, archive everything older than 85d).

## Continuous aggregates

`signal_metrics_hourly` / `signal_metrics_daily` are **separate** hypertable-like structures. If they grow without bound, add their own **compression** and **retention** policies (often **longer** keep for dashboards). Not included in `003_*.sql` by default.

## SQL files (order)

1. `001_extension_and_hypertables.sql`
2. `002_continuous_aggregates.sql` (optional for dashboards)
3. `003_compression_retention.sql`

## Example archive pipeline

1. **Parquet (recommended in AWS):** `COPY (SELECT ... WHERE time >= $1 AND time < $2) TO STDOUT` → pipe to a small **Python** job using **pyarrow** / **pandas**, or land **CSV** in S3 and **convert** with **AWS Glue** / **EMR** to Parquet.
2. **S3:** Server-side **encryption** (SSE-S3 or **KMS**), **lifecycle** to **Glacier** for cold compliance tiers.
3. **IAM:** Dedicated role for the job; **no** long-lived keys in the app container if avoidable (IRSA on EKS, task role on Lambda).

## Script stub

`scripts/timescale/archive-signal-metrics-to-s3.sh` — example **CSV + gzip** upload to S3 (no Parquet dependency in shell). Convert to Parquet in a downstream job or replace with a **Python** exporter.

## Storage impact

- **Compression** reduces on-disk size for old chunks and speeds some scans.
- **Retention** removes raw rows from the database; **S3** becomes the long-term store for compliance/analytics.
- **Dashboards** should use **continuous aggregates** and stay within a **short** time window to avoid scanning raw post-compression data unnecessarily.

## Related

- `docs/TIMESCALE.md` — connection & pool
- `docs/TIMESCALE_SCHEMA.md` — tables
- `docs/TIMESCALE_CONTINUOUS_AGGREGATES.md` — rollups
