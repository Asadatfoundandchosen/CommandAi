#!/usr/bin/env bash
# Query Prometheus for SLO snapshot (Markdown). Requires curl + jq.
# Usage: PROMETHEUS_URL=https://prom.example.com ./scripts/slo-monthly-report.sh
set -euo pipefail

BASE="${PROMETHEUS_URL:?Set PROMETHEUS_URL to Prometheus base URL}"
MONTH="${REPORT_MONTH:-$(date -u +%Y-%m)}"

query() {
  local enc
  enc=$(jq -rn --arg q "$1" '$q|@uri')
  curl -sf "${BASE}/api/v1/query?query=${enc}" | jq -r '.data.result[0].value[1] // "n/a"'
}

avail=$(query "slo:platform_api:request_success_ratio:30d")
lat=$(query "slo:platform_api:latency_under_200ms_ratio:30d")
err=$(query "slo:platform_api:error_ratio:30d")
bud_a=$(query "slo:platform_api:availability_error_budget_consumed:30d")
bud_l=$(query "slo:platform_api:latency_error_budget_consumed:30d")

cat <<EOF
## 1CommandAI — Monthly SLO summary (${MONTH} generated UTC $(date -u +%Y-%m-%dT%H:%MZ))

**Targets:** availability ≥99.9%, ≥99% requests ≤200ms, 5xx rate <0.1%.

| Metric | Value (instant 30d recording rules) |
| --- | --- |
| Availability SLI (success ratio) | ${avail} |
| Latency SLI (share ≤200ms) | ${lat} |
| 5xx / total | ${err} |
| Availability error budget consumed (0–1+) | ${bud_a} |
| Latency error budget consumed (0–1+) | ${bud_l} |

_Data source: Prometheus at ${BASE}. Extend retention to ≥30d for full windows._

EOF
