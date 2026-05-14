#!/usr/bin/env bash
# Example: export a time window from `signal_metrics` to gzipped CSV and upload to S3.
# Parquet: land CSV in S3 and convert with Glue/Spark, or use a small Python+pyarrow job.
#
# Usage:
#   export TIMESCALE_DATABASE_URL=postgresql://...
#   export S3_ARCHIVE_BUCKET=my-bucket
#   # optional: S3_PREFIX=timescale/signal_metrics
#   ./archive-signal-metrics-to-s3.sh 2024-01-01T00:00:00Z 2024-01-02T00:00:00Z
#
# Run on a schedule **before** data is dropped by retention; see `docs/TIMESCALE_DATA_LIFECYCLE.md`.
set -euo pipefail

FROM_TS="${1:?from (timestamptz string)}"
TO_TS="${2:?to (timestamptz string)}"
BUCKET="${S3_ARCHIVE_BUCKET:?set S3_ARCHIVE_BUCKET}"
PREFIX="${S3_PREFIX:-timescale/signal_metrics}"
SAFE_FROM="${FROM_TS//[:]/_}"
SAFE_TO="${TO_TS//[:]/_}"
OUT="/tmp/signal_metrics_${SAFE_FROM}_${SAFE_TO}.csv.gz"

psql "$TIMESCALE_DATABASE_URL" -v ON_ERROR_STOP=1 <<EOSQL | gzip -c > "$OUT"
\copy (SELECT "time", org_id, agent_id, signal_type, severity, value, metadata, id
       FROM signal_metrics
       WHERE "time" >= '$FROM_TS'::timestamptz AND "time" < '$TO_TS'::timestamptz) TO STDOUT WITH (FORMAT csv, HEADER true)
EOSQL

KEY="${PREFIX}/from=${SAFE_FROM}_to=${SAFE_TO}/part-$(date -u +%Y%m%dT%H%M%SZ).csv.gz"
aws s3 cp "$OUT" "s3://${BUCKET}/${KEY}" --only-show-errors
rm -f "$OUT"
echo "Uploaded s3://${BUCKET}/${KEY}"
