# Datadog APM (cluster agent + Node tracer)

## Acceptance criteria (story checklist)

| Criterion                              | Status in this repo                                                                                                                                                                                           | How to satisfy / verify                                                                                                                                                                                                                                             |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Datadog agent running on all nodes** | **Supported** — Helm chart installs the **Node Agent as a DaemonSet** by default (one agent pod per schedulable node). Values in `helm-values/datadog.yaml`.                                                  | After `helm upgrade --install …`, run `kubectl get daemonset -n datadog` and `kubectl get pods -n datadog -o wide` — pod count should match nodes (minus taints/cordons).                                                                                           |
| **APM traces visible**                 | **Supported** — API loads `dd-trace` before Express when Datadog path is active (`src/telemetry.ts`, `src/datadog.ts`). Ensure workload env points at the agent (`DD_AGENT_HOST`, APM port/socket per chart). | **APM → Traces** (or **Service** page) with `service:<DD_SERVICE>` and `env:<DD_ENV>`.                                                                                                                                                                              |
| **Custom metrics recorded**            | **Supported** — `api.request.*` emitted from middleware; `credit.consumed` / `signal.processed` via helpers in `src/lib/datadog-metrics.ts` (call from real code paths).                                      | **Metrics → Explorer** search `api.request.count`, `api.request.duration`, `credit.consumed`, `signal.processed`. Confirm DogStatsD reachability from app pods.                                                                                                     |
| **Dashboard shows all services**       | **Partial** — README lists recommended widgets; no checked-in multi-service dashboard JSON (org-specific).                                                                                                    | Build one dashboard with a **Service list** or **group by `service`** on APM/Runtime metrics; ensure every workload sets **`DD_SERVICE`** (and `DD_ENV`) consistently.                                                                                              |
| **Error tracking configured**          | **Partial** — Backend errors surface via APM traces; **Error Tracking** product setup (rules, source maps, RUM linkage) is done in the Datadog UI/org.                                                        | Enable **Error Tracking for Backend** / link services; facet on `service`, `version`, `env`.                                                                                                                                                                        |
| **Alerts configured for SLOs**         | **Not in repo** — SLOs and composite monitors live in Datadog or IaC (e.g. Terraform `datadog_service_level_objective`, `datadog_monitor`).                                                                   | Create SLOs on latency/error budgets, attach **burn-rate** or threshold **monitors**, route to PagerDuty/Slack. See [SLO](https://docs.datadoghq.com/service_management/service_level_objectives/) and [Monitor types](https://docs.datadoghq.com/monitors/types/). |

**Summary:** The repo covers **agent (DS) + tracer + custom metrics** in code and Helm values. **Dashboards (all services), Error Tracking policy, and SLO alerts** are completed in **Datadog / Terraform** using the patterns above—not fully codified here.

Install the **Datadog Agent** as a **DaemonSet** on Kubernetes using the official Helm chart. The API ships **`dd-trace`** (see `src/datadog.ts`, `src/telemetry.ts`) with **continuous profiling** enabled by default (`DD_PROFILING_ENABLED=false` to disable).

## Helm install (agent DaemonSet)

```bash
helm repo add datadog https://helm.datadoghq.com
helm repo update
kubectl create namespace datadog --dry-run=client -o yaml | kubectl apply -f -
# Store the API key in a Secret (never commit real keys).
kubectl -n datadog create secret generic datadog-secret --from-literal api-key='<DD_API_KEY>' --dry-run=client -o yaml | kubectl apply -f -
helm upgrade --install datadog-agent datadog/datadog -n datadog -f infrastructure/k8s/apm/helm-values/datadog.yaml
```

Tune `datadog.clusterName`, `datadog.site` (`datadoghq.com` vs `datadoghq.eu`), and resource limits for your cluster.

## API environment (platform workload)

| Variable                        | Purpose                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `DD_SERVICE` / `SERVICE_NAME`   | Service name in Datadog (default `platform-api`)                                                                                            |
| `DD_ENV` / `DEPLOY_ENV`         | Environment tag                                                                                                                             |
| `DD_VERSION` / `GIT_COMMIT_SHA` | Version tag                                                                                                                                 |
| `DD_AGENT_HOST`                 | Agent host (often set by chart via downward API)                                                                                            |
| `DD_TRACE_AGENT_PORT`           | APM trace port (default `8126`)                                                                                                             |
| `DD_DOGSTATSD_PORT`             | DogStatsD UDP (default `8125`)                                                                                                              |
| `DD_PROFILING_ENABLED`          | `true` / `false` — Node continuous profiler                                                                                                 |
| `APM_PROVIDER`                  | Omit or set to anything other than `otel` for Datadog. Set **`otel`** to use **OpenTelemetry → Jaeger** instead (`src/instrumentation.ts`). |

DogStatsD is reachable from pods when the chart exposes hostPort or hostNetwork / CNI allows host access; follow [DogStatsD origin detection](https://docs.datadoghq.com/developers/dogstatsd/?tab=kubernetes) for your network model.

## Custom metrics (business KPIs)

Emitted from `src/lib/datadog-metrics.ts`:

| Metric                 | Type           | When                                                      |
| ---------------------- | -------------- | --------------------------------------------------------- |
| `api.request.count`    | count          | Each HTTP response (`datadogRequestMetricsMiddleware`)    |
| `api.request.duration` | histogram (ms) | Each HTTP response                                        |
| `credit.consumed`      | count          | Call `incrementCreditConsumed()` from billing/credit code |
| `signal.processed`     | count          | Call `incrementSignalProcessed()` from workers/pipeline   |

Tags on HTTP metrics: `method`, `route`, `status`.

## Datadog dashboards (UI)

Create three dashboards in **Dashboards → New Dashboard** (or **Terraform** `datadog_dashboard`):

1. **Service overview** — APM **Service** page widgets: request rate, error rate, latency (p50/p95), deployment markers, runtime metrics.
2. **Error tracking** — **Error Tracking** / **APM** errors by service; facet on `env`, `version`, `resource_name`; include trace links.
3. **Latency breakdown** — **Trace** **flame graph** / **span** breakdown by `express.request`, downstream DB/HTTP spans; top endpoints by duration.

Importable JSON starters live under `infrastructure/k8s/apm/dashboards/` (minimal templates — adjust `service` / `env` filters in the UI after import).

## Datadog SSO

Configure organization SSO from **Organization Settings → Authentication** using **SAML** or **OpenID Connect**. Vendor guides:

- [SAML single sign-on](https://docs.datadoghq.com/account_management/saml/)
- [OpenID Connect](https://docs.datadoghq.com/account_management/org_settings/#openid-connect)

Use your IdP’s metadata URL; map groups to Datadog roles as needed. Do not store IdP secrets in this repository.
