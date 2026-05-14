# Prometheus + Grafana (kube-prometheus-stack)

Observability defaults: **Prometheus** scrapes every **15s**, **15d** retention, **Grafana** dashboards + persistence. Aligns with platform context in `.cursor/rules/SYSTEM-PROMPT.mdc`. Centralized **logs** (**Loki** + **Promtail**) live in [`../logging/README.md`](../logging/README.md). **Jaeger** tracing + Grafana datasource/dashboards: [`../tracing/README.md`](../tracing/README.md).

## Install (Helm)

```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm upgrade --install kube-prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring --create-namespace \
  --values infrastructure/k8s/monitoring/helm-values/kube-prometheus-stack.yaml
```

1. Set a real Grafana admin password (Helm value `grafana.admin.existingSecret` recommended).
2. Set `release: kube-prometheus-stack` labels on your **ServiceMonitors** to match the **actual** Helm release name if you use `serviceMonitorSelectorNilUsesHelmValues: true` in upstream defaults — the sample values file disables nil Helm matching and uses empty selectors so cluster-wide SMs apply; confirm against your chart version.

## Persistent storage

Sample values request **50Gi** Prometheus, **10Gi** Alertmanager, **10Gi** Grafana PVCs. Tune `storageClassName` in your fork if your cluster requires it.

## ServiceMonitors

See `servicemonitors/README.md`. Apply **`platform-api.yaml`** per app namespace after the API **Service** exists.

**MongoDB / Redis:** install community exporters (e.g. `prometheus-mongodb-exporter`, `prometheus-redis-exporter`) and align Service **port names** with the ServiceMonitor manifests.

## Grafana dashboards

```bash
kubectl apply -k infrastructure/k8s/monitoring/grafana
```

Dashboards assume Prometheus datasource **uid** `prometheus` (kube-prometheus-stack default). If yours differs, edit JSON under `grafana/dashboards/`. **`mongodb-shard-chunks.json`** is a runbook view for **Atlas** sharding / chunk distribution (self-hosted exporter metrics can be added later; see `docs/mongodb-sharding-strategy.md`).

## Grafana SSO (GitHub)

1. GitHub → **Settings** → **Developer settings** → **OAuth Apps** — callback URL `https://<your-grafana-host>/login/github`.
2. Create Secret from `secrets/grafana-github-oauth.example.yaml` (real values via Vault / ExternalSecrets).
3. In Helm values, set `grafana.envFromSecret` / `grafana.ini` `auth.github` (see commented block in `helm-values/kube-prometheus-stack.yaml`) or pass **`GF_AUTH_GITHUB_*`** via `extraEnvFrom` pointing at that Secret.

Restrict access with **`auth.github.allowed_organizations`** (e.g. `1commandai`).

## API metrics

The platform API exposes **`GET /metrics`** on port **3000** (`prom-client`: HTTP histograms + **`bullmq_queue_size`** `{queue,status}` for BullMQ). The **ServiceMonitor** scrapes path **`/metrics`** on Service port **`http`**.

## PrometheusRules (P1 / P2 / P3)

Severity rules live in **`prometheusrules/platform-severity-alerts.yaml`**:

| Severity | Alerts                                                                     |
| -------- | -------------------------------------------------------------------------- |
| **P1**   | API scrape down **>1m**; HTTP **5xx rate >10%** (with traffic)             |
| **P2**   | HTTP **p99 latency >1s**; **BullMQ waiting** sum **`bullmq_queue_size` >1000**; optional **Redis keys** proxy **>1000** |
| **P3**   | Node **memory >80%**; node **disk >70%**                                   |

Apply (namespace must match your Prometheus install, default **`monitoring`**):

```bash
kubectl apply -k infrastructure/k8s/monitoring/prometheusrules
```

Tune label selectors (`service="platform-api"`, `namespace`) to match scrape labels in **Prometheus → Graph** before production.

## Alertmanager: PagerDuty (P1) + Slack (P2/P3)

1. Create Secret from **`secrets/alertmanager-external-secrets.example.yaml`** (real values via Vault / ExternalSecrets).
2. Merge **`helm-values/alertmanager-routing.example.yaml`** into your kube-prometheus-stack values (same `alertmanager:` key), or copy `config` + `alertmanagerSpec.secrets` only.
3. **Inhibit rules** in the example suppress **error rate** and **latency** alerts when **PlatformAPIDown** fires for the same `namespace` (symptom vs cause).

**PagerDuty** service, **escalation policy**, and **on-call schedule**: see **`docs/runbooks/pagerduty-onboarding.md`**. Operational runbooks: **`docs/runbooks/`**.

## SLO / SLA tracking

| Target                                                        | Implementation                                                                                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Availability 99.9%** (~43.8 min bad / month at steady rate) | Recording + budget ratio in **`prometheusrules/slo-recording-rules.yaml`**                                                                                     |
| **Latency: 99% requests ≤200ms**                              | Histogram bucket **`le="0.2"`** (API adds **`0.2`**s to `http_request_duration_seconds` buckets)                                                               |
| **Error rate under 0.1%**                                     | Same 5xx/total series as availability target alignment                                                                                                         |
| **Budget alerts 50% / 75% / 100%**                            | **`prometheusrules/slo-budget-alerts.yaml`**                                                                                                                   |
| **Grafana**                                                   | **`grafana/dashboards/slo-reliability.json`** (SLI, budget remaining, burn, 30d trend)                                                                         |
| **Monthly report email**                                      | **`scripts/slo-monthly-report.sh`** + **`.github/workflows/slo-monthly-report.yml`** — set **`PROMETHEUS_URL`**; see **`docs/runbooks/slo-monthly-report.md`** |

Set Prometheus **retention ≥30d** in **`helm-values/kube-prometheus-stack.yaml`** for full rolling 30d windows (default sample is **15d** — extend for monthly SLO).

```bash
kubectl apply -k infrastructure/k8s/monitoring/grafana
kubectl apply -k infrastructure/k8s/monitoring/prometheusrules
```

### SLO acceptance criteria (story checklist)

| Criterion                              | Status in this repo                                                                                                                                                                                                                                                                                    | How to satisfy / verify                                                                                                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **SLO dashboard shows current values** | **Supported** — **`slo-reliability.json`** stat panels for availability, latency (≤200ms share), and 5xx/total; uses recording rules `slo:platform_api:*:30d`.                                                                                                                                         | Open Grafana → **1CommandAI — SLO / SLA**; confirm non-empty series when **`service="platform-api"`** scrapes exist.                                                                                                                                                     |
| **Error budget calculated correctly**  | **Supported** — **`slo-recording-rules.yaml`**: availability consumed = `(1 - success) / 0.001`; latency = `(1 - share≤200ms) / 0.01`. Gauges show **remaining** = `clamp_min(1 - consumed, 0)`.                                                                                                       | In **Prometheus → Graph**, compare `slo:platform_api:availability_error_budget_consumed:30d` to a manual check from `rate(http_request_duration_seconds_count[30d])` (spot-check). **Requires ≥30d retention** for a true 30d window; shorter retention clips the range. |
| **Burn rate visualization works**      | **Supported** — panel **Availability burn** plots `slo:platform_api:availability_burn_multiplier_1h` (1h 5xx share ÷ **0.001** allowance). Not multi-window SRE burn rate; shows short-term pressure vs monthly allowance.                                                                             | Confirm the panel moves when 5xx traffic changes; see **`docs/runbooks/slo-error-budget.md`**.                                                                                                                                                                           |
| **Alerts fire at budget thresholds**   | **Supported** — **`slo-budget-alerts.yaml`**: exclusive bands for **50% / 75%** and **`>= 1`** for exhaustion; **`for:`** 5–10m to reduce noise.                                                                                                                                                       | **Alertmanager** / **Prometheus → Alerts**; optional: inject load or use **unittest** env to push SLI (sandbox only).                                                                                                                                                    |
| **Historical data shows trends**       | **Partial** — trend panel graphs **`slo:platform_api:request_success_ratio:30d`** and **latency** ratio over time. **Limited** to Prometheus **retention** (default sample **15d**): `[30d]` range only has data back to the oldest retained sample, so “30d trend” is full only after retention ≥30d. | Set **`retention: 30d`** (or remote read); zoom dashboard to **Last 30 days**.                                                                                                                                                                                           |
| **Monthly report generated**           | **Partial** — **`.github/workflows/slo-monthly-report.yml`** runs monthly + **manual** dispatch; uploads **`slo-report.md`** artifact. **`PROMETHEUS_URL`** unset → **dry-run** stub. **Email** step is **commented** (add SMTP secrets to enable).                                                    | Configure **`PROMETHEUS_URL`**; run workflow manually; download artifact. Enable mail per **`docs/runbooks/slo-monthly-report.md`**.                                                                                                                                     |

## Acceptance criteria (story checklist)

| Criterion                            | Status in this repo                                                                                                                                                              | How to satisfy / verify                                                                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Test alert triggers notification** | **Partial** — no CI smoke test; wiring is in Helm + Secret examples.                                                                                                             | PagerDuty **Send test event**; or Alertmanager `POST /api/v1/alerts` with `severity: p1` / `p2`; see **`docs/runbooks/pagerduty-onboarding.md` §5**.                                 |
| **P1 pages on-call via PagerDuty**   | **Supported** — route `severity=p1` → `pagerduty-p1` receiver (`alertmanager-routing.example.yaml`).                                                                             | After Secret + Helm merge, send test event; incident reaches **service** integration and on-call per policy.                                                                         |
| **P2/P3 posts to Slack**             | **Supported** — route `severity=~p2\|p3` → `slack-p2-p3`.                                                                                                                        | Fire or inject alert with `severity: p2` or `p3`; confirm **`#alerts-p2-p3`** (or your channel) receives the message.                                                                |
| **Escalation works after 5 min**     | **Documented** — delay is **PagerDuty escalation policy** (not Alertmanager).                                                                                                    | In PagerDuty, set second tier **5m** after unacknowledged; verify with §5 in **`pagerduty-onboarding.md`**. `group_interval: 5m` in Alertmanager is **batching**, not PD escalation. |
| **Runbook links in alerts**          | **Supported** — every rule in **`prometheusrules/platform-severity-alerts.yaml`** sets `annotations.runbook_url`; receivers append it as **Runbook:** in Slack + PagerDuty body. | Inspect a delivered notification; URL should match GitHub `main` or replace with your wiki base.                                                                                     |
| **On-call schedule visible**         | **Operational** — lives in **PagerDuty** (People → Schedules).                                                                                                                   | Create/link schedule per runbook; team verifies **who is on call** in UI or mobile app.                                                                                              |
