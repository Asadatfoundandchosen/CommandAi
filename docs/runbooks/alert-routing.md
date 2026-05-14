# Alert routing and inhibit rules

## Routing

- **P1** (`severity: p1`): **PagerDuty** — wake on-call per escalation policy.
- **P2 / P3** (`severity: p2` or `p3`): **Slack** (`#alerts-p2-p3` or your channel).

Implement with Alertmanager `route` + `matchers` on `severity`. Example values: `infrastructure/k8s/monitoring/helm-values/alertmanager-routing.example.yaml`.

## Inhibit rules (symptoms vs cause)

When **PlatformAPIDown** fires (no scrape / API effectively unreachable), **suppress** related **PlatformAPIHighErrorRate** and **PlatformAPIHighLatencyP99** for the same `namespace` so responders are not flooded with derivative alerts.

Extend the same pattern for infrastructure: e.g. node **NotReady** inhibiting disk/memory alerts on that node (`equal: ['instance']`).

## References

- [Alertmanager configuration](https://prometheus.io/docs/alerting/latest/configuration/)
- [Inhibition](https://prometheus.io/docs/alerting/latest/configuration/#inhibit_rule)
