# Distributed tracing (Jaeger + OpenTelemetry)

The API ships **OpenTelemetry** with **`@opentelemetry/auto-instrumentations-node`**, **OTLP HTTP** export to the **Jaeger collector**, and **W3C trace context** propagation. Sampling: **`DEPLOY_ENV=prod`** → **10%** (`TraceIdRatioBasedSampler`); otherwise **100%** (override with **`OTEL_TRACES_SAMPLER_ARG`**).

## Jaeger (Helm)

```bash
helm repo add jaegertracing https://jaegertracing.github.io/helm-charts
helm repo update

helm upgrade --install jaeger jaegertracing/jaeger \
  --namespace monitoring --create-namespace \
  --values infrastructure/k8s/tracing/helm-values/jaeger.yaml
```

1. Point **`OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`** (or **`OTEL_EXPORTER_OTLP_ENDPOINT`**) on the **platform-api** Deployment at the **collector OTLP HTTP** endpoint (often **`http://jaeger-collector:4318/v1/traces`** — confirm with `kubectl get svc -n monitoring`).
2. **Elasticsearch**: set **`storage.elasticsearch.serverUrls`** (and credentials / TLS) in **`helm-values/jaeger.yaml`**. Run Elasticsearch separately (ECK, AWS OpenSearch, etc.) or use the chart’s optional ES subchart if enabled for your chart version.
3. **7-day retention**: configure **Elasticsearch ILM** (or index `max_age` / delete phase) on Jaeger indices (`jaeger-*` / chart default prefix). Jaeger does not replace ES lifecycle policies.

## Grafana

```bash
kubectl apply -k infrastructure/k8s/tracing/grafana
```

Datasource **uid** **`jaeger`** → Jaeger **Query** UI (`16686`). Adjust URL if your release name or namespace differs.

## App environment (Kubernetes)

| Variable                             | Purpose                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `DEPLOY_ENV`                         | `prod` → **10%** trace sampling (unless overridden).                                                        |
| `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` | Full OTLP HTTP URL for traces (e.g. `http://jaeger-collector.monitoring.svc.cluster.local:4318/v1/traces`). |
| `OTEL_SERVICE_NAME` / `SERVICE_NAME` | Logical service name (default **`platform-api`**).                                                          |

Trace attributes **`org.id`** and **`user.id`** are set from **`x-org-id`** and **`x-user-id`** (`src/lib/trace-middleware.ts`).
