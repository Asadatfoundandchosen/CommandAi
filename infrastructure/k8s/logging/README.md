# Centralized logging (Loki + Promtail)

**Loki** stores logs (object storage on **S3** in this layout); **Promtail** ships node logs as a **DaemonSet**. Target: **30-day** retention, **JSON** logs from apps with **per-service** stream labels (via Promtail `json` + `labels` stages).

**Grafana** (from `kube-prometheus-stack` or standalone) consumes Loki as a datasource; dashboards and **ERROR** spike alerts live under `grafana/` and `alerting/`. Set **`SERVICE_NAME`** on the API Deployment if you want a fixed `service` field in JSON logs (default **`platform-api`** in code).

## Helm install

```bash
helm repo add grafana https://grafana.github.io/helm-charts
helm repo update

helm upgrade --install loki grafana/loki \
  --namespace monitoring --create-namespace \
  --values infrastructure/k8s/logging/helm-values/loki.yaml

helm upgrade --install promtail grafana/promtail \
  --namespace monitoring \
  --values infrastructure/k8s/logging/helm-values/promtail.yaml
```

1. Create **S3 buckets** (chunks + ruler, or single bucket per your `loki.yaml`) and IAM policy; attach **IRSA** to Loki’s `serviceAccount` (`helm-values/loki.yaml` annotations placeholder). If `helm install` fails on schema or storage, merge **`loki.schemaConfig`** (and any required defaults) from `helm show values grafana/loki` for your chart version.
2. Point **Promtail** `clients[0].url` at your Loki **write** URL (`gateway` or `distributor`/`single-binary` service — see `kubectl get svc -n monitoring` after install).
3. Apply Grafana sidecar resources: `kubectl apply -k infrastructure/k8s/logging/grafana`

Distributed **tracing** (**Jaeger** + OpenTelemetry) is documented in [`../tracing/README.md`](../tracing/README.md).

## Grafana GitHub SSO

Use the same pattern as **`infrastructure/k8s/monitoring/secrets/grafana-github-oauth.example.yaml`** and the commented **`auth.github`** block in **`infrastructure/k8s/monitoring/helm-values/kube-prometheus-stack.yaml`** (one Grafana instance can serve both Prometheus and Loki datasources).

## App log contract

Logs are **one JSON object per line** with at least: **`timestamp`**, **`level`**, **`service`**, **`trace_id`**, **`org_id`**, **`message`**. The API uses **`pino`** + **`pino-http`** (`src/lib/logger.ts`, `src/main.ts`): pass **`x-trace-id`** / **`x-request-id`** and **`x-org-id`** on requests for correlation.

## Alerts (ERROR spike)

See `alerting/README.md` for **Grafana Alerting** LogQL (recommended) or ruler wiring for your Loki chart version.
