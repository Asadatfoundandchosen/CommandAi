# Runbook: Platform API high 5xx error rate

## Symptoms

- Alert **PlatformAPIHighErrorRate** (P1) — 5xx share of traffic > 10% for 5 minutes (with minimum traffic).

## Checks

1. **Logs**: filter `level=50` or `status_code=5xx` on the API workload (Loki / ELK).
2. **Dependencies**: DB, Redis, downstream HTTP — timeouts often surface as 5xx.
3. **Recent deploys**: correlate version and error spike.
4. **Prometheus**: `sum by (status_code) (rate(http_request_duration_seconds_count{service="platform-api"}[5m]))`.

## Mitigation

- Roll back bad release; scale out if overload.
- Fix failing dependency or add circuit breaker / timeouts as appropriate.

## Note

If **PlatformAPIDown** is also firing, treat API reachability first; Alertmanager **inhibits** this alert when down is the root cause (same `namespace`).
