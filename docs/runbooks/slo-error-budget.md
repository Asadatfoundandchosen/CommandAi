# Runbook: SLO error budget (availability & latency)

## Targets (platform-api)

| SLO              | Target                                            | Error budget (rolling 30d)                                                                               |
| ---------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Availability** | ≥ **99.9%** successful requests (non-5xx / total) | **0.1%** bad — ~**43.8 minutes/month** of bad-equivalent at steady abuse (30.44 d/mo × 1440 min × 0.001) |
| **Latency**      | ≥ **99%** of requests ≤ **200ms**                 | **1%** may exceed 200ms                                                                                  |
| **Error rate**   | **< 0.1%** 5xx                                    | Same numerator as availability for pure 5xx; tracked on the SLO dashboard                                |

PrometheusRules: `infrastructure/k8s/monitoring/prometheusrules/slo-budget-alerts.yaml`. Recording rules: `slo-recording-rules.yaml`.

## When an alert fires

1. Open **Grafana** → dashboard **1CommandAI — SLO / SLA** (`slo-reliability.json`).
2. Check **burn** panel: short-window spikes vs 30d SLI.
3. Correlate deploys, dependency outages, saturation (CPU, DB, Redis).
4. For **latency** breaches: see `high-latency-p99.md`; for **5xx** spikes: `high-error-rate.md`.

## Notes

- Set Prometheus **retention ≥30d** for accurate monthly budgets; shorter retention clips `[30d]` windows.
- Histogram bucket **`le="0.2"`** requires the `0.2s` bucket in `http_request_duration_seconds` (see API `main.ts`).
