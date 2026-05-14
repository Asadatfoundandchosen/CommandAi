# Log-based alerts (ERROR spike)

Use **Grafana Alerting** with the **Loki** datasource (provisioned via `grafana/datasources/loki.yaml`).

## Example rule (LogQL)

**Condition** — high rate of JSON `level="ERROR"` lines for the API service (tune threshold and window):

```logql
sum(count_over_time({service="platform-api"} | json | level="ERROR" [5m])) > 50
```

## Steps (Grafana UI)

1. **Alerting** → **Alert rules** → **New alert rule**.
2. Query **A**: paste the LogQL above as a **range** query over **5m**.
3. Reduce / threshold: fire when **A** is **above** your threshold for **N** consecutive evaluations.
4. Add **contact point** (Slack, PagerDuty, etc.) and route in **Notification policies**.

## Loki ruler (optional)

If you enable the **Loki ruler** in your Helm deployment, you can store rule files in object storage or ConfigMaps per [Grafana Loki ruler docs](https://grafana.com/docs/loki/latest/rules/). Chart-specific keys change between releases—merge with your `loki` chart version.
