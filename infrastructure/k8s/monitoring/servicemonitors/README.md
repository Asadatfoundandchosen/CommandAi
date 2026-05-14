# ServiceMonitors

- **`platform-api.yaml`** — apply in **each** app namespace (`1commandai-dev`, …). Prometheus must scrape that namespace (`serviceMonitorNamespaceSelector` is set to `{}` in the sample Helm values).
- **`mongodb-exporter.yaml`** / **`redis-exporter.yaml`** — expect exporter **Services** in **`monitoring`** with labels `app.kubernetes.io/name` as shown. Adjust `namespace`, `release`, and **port names** to match your Helm releases (`helm get manifest`).

**Node exporter:** included with **`kube-prometheus-stack`**; no extra ServiceMonitor is required unless you run a standalone `node_exporter`.
