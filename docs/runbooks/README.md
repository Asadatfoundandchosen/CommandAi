# Operational runbooks

Severity routing (see `infrastructure/k8s/monitoring/`): **P1** → PagerDuty, **P2/P3** → Slack; escalation and on-call live in **PagerDuty** for P1.

| Alert / scenario                        | Runbook                                              |
| --------------------------------------- | ---------------------------------------------------- |
| API scrape / health failure             | [api-down.md](./api-down.md)                         |
| High 5xx rate                           | [high-error-rate.md](./high-error-rate.md)           |
| High HTTP latency (p99)                 | [high-latency-p99.md](./high-latency-p99.md)         |
| Queue / Redis depth                     | [queue-depth-high.md](./queue-depth-high.md)         |
| MongoDB primary failover (Atlas)        | [mongodb-failover.md](./mongodb-failover.md)         |
| MongoDB backup / PITR / restore         | [mongodb-restore.md](./mongodb-restore.md)           |
| Node memory pressure                    | [node-memory-high.md](./node-memory-high.md)         |
| Node disk utilization                   | [node-disk-high.md](./node-disk-high.md)             |
| PagerDuty service, escalation, schedule | [pagerduty-onboarding.md](./pagerduty-onboarding.md) |
| Alert routing & inhibits                | [alert-routing.md](./alert-routing.md)               |
| SLO error budget (50/75/100%)           | [slo-error-budget.md](./slo-error-budget.md)         |
| Monthly SLO report (email automation)   | [slo-monthly-report.md](./slo-monthly-report.md)     |
