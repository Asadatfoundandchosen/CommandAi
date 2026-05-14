# Runbook: Platform API high latency (p99 > 1s)

## Symptoms

- Alert **PlatformAPIHighLatencyP99** (P2).

## Checks

1. Grafana dashboard **API performance** (`infrastructure/k8s/monitoring/grafana/dashboards/api-performance.json`).
2. Break down `http_request_duration_seconds_bucket` by `route`, `method`.
3. **Saturation**: CPU throttling, connection pool wait, slow queries.
4. **Infrastructure**: node CPU / memory, noisy neighbor.

## Mitigation

- Scale API replicas; tune pool sizes and query timeouts.
- Optimize hot routes; add caching where safe.

## Note

If **PlatformAPIDown** fires for the same namespace, latency alerts are **inhibited** as a symptom of total outage.
