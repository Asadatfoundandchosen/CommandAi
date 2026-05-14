# Runbook: Queue depth high (Redis proxy metric)

## Symptoms

- Alert **QueueDepthHigh** (P2) — `sum(redis_db_keys) > 1000` (proxy until a dedicated `queue_depth` metric exists).

## Checks

1. Redis memory and evictions; slow consumers.
2. Worker / queue pods (Bull/BullMQ) — lag, failed jobs, DLQ.
3. Application dashboards: queue depth panel in `queue-depth.json`.

## Mitigation

- Scale consumers; replay or drain poison messages.
- When instrumented, switch the PrometheusRule to `sum(queue_depth)` (or labeled series) for an accurate signal.
