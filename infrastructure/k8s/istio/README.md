# Istio service mesh (1CommandAI)

Istio **1.20+** installed with **istioctl**, **production** profile, **strict mTLS**, **Envoy access logging** to stdout, and manifests in this directory for mesh policy, app namespaces, ingress, and **Kiali** exposure.

Telemetry is aligned with **Prometheus** scraping of sidecars and control plane; use Grafana Istio dashboards or **Kiali** for topology and mTLS status.

## Prerequisites

- Kubernetes **1.28+** (matches EKS module defaults).
- Cluster admin `kubectl` context.
- [istioctl](https://istio.io/latest/docs/setup/getting-started/#download) **1.20** or newer on your PATH.

## Install Istio control plane

From a machine with `kubectl` and `istioctl` (version should match the minor of the cluster install):

```bash
istioctl version   # client 1.20+ recommended

# Install using the committed IstioOperator (production profile, access logs, Prometheus merge)
istioctl install -f infrastructure/k8s/istio/istio-operator.yaml -y

# Wait for ready
kubectl rollout status deployment/istiod -n istio-system --timeout=5m
kubectl get pods -n istio-system
```

The operator file sets **mesh-wide access logs** (`meshConfig.accessLogFile`) and options that help **Prometheus** merge scrape configs. After install, apply mesh security and app manifests:

```bash
kubectl apply -f infrastructure/k8s/istio/mesh/
kubectl apply -f infrastructure/k8s/istio/namespaces/
kubectl apply -f infrastructure/k8s/istio/routing/
```

## Kiali

Install the upstream add-on (manifests ship with each Istio release; pin your release to match `istioctl`):

```bash
# Example: after extracting Istio release tarball, from that directory:
kubectl apply -f samples/addons/kiali.yaml
kubectl rollout status deployment/kiali -n istio-system --timeout=5m
```

Then apply this repo’s **Kiali VirtualService** (uses the same `public-gateway`; point DNS `kiali.istio-system.example.com` at your ingress, or change the host in the manifest):

```bash
kubectl apply -f infrastructure/k8s/istio/addons/kiali-access.yaml
```

**Local access (no ingress):**

```bash
kubectl port-forward -n istio-system svc/kiali 20001:20001
# open http://localhost:20001
```

## Namespace sidecar injection

Application namespaces use the label **`istio-injection=enabled`** (see `namespaces/`). Pods created **after** the label exists get the Istio sidecar. Restart existing Deployments if you add the label later.

## Verify strict mTLS between services

1. **Check mesh policy**

   ```bash
   kubectl get peerauthentication.security.istio.io -A
   kubectl describe peerauthentication default-strict-mtls -n istio-system
   ```

2. **Istio mTLS status for a pair of services** (example: client pod in `1commandai-apps` calling `api`):

   ```bash
   CLIENT_POD=$(kubectl get pod -n 1commandai-apps -l app=sleep -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
   # If you deploy istio's sleep sample:
   # kubectl apply -f https://raw.githubusercontent.com/istio/istio/release-1.20/samples/sleep/sleep.yaml -n 1commandai-apps

   istioctl authn tls-check "${CLIENT_POD}.1commandai-apps" "api.1commandai-apps.svc.cluster.local"
   ```

3. **Envoy access logs** (confirm TLS handshake / response codes):

   ```bash
   kubectl logs -n 1commandai-apps "${CLIENT_POD}" -c istio-proxy --tail=50
   ```

4. **Kiali:** open the graph, select namespace `1commandai-apps`, enable **Security** display — edges should show **mTLS** when traffic flows through injected pods.

## Prometheus / Grafana

- **Prometheus:** scrape annotations on workloads are optional; Istio exposes metrics on sidecar `:15090/stats/prometheus` and Mixer-less telemetry paths. Use the [Istio monitoring addons](https://istio.io/latest/docs/ops/integrations/prometheus/) or your existing Prometheus `ServiceMonitor` / scrape configs for `istio-system` and app namespaces.
- **Grafana:** import Istio dashboards from [Istio org](https://github.com/istio/istio/tree/master/manifests/addons/dashboards) or install `samples/addons/grafana.yaml` from the Istio release bundle alongside Prometheus.

## Acceptance criteria checklist

Run these **after** `istioctl install`, mesh manifests, and workloads are up. Several items require a live cluster and tools (`istioctl`, `kubectl`, Kiali, log pipeline).

| Criterion | How to verify | Repo / config status |
|-----------|----------------|----------------------|
| **`istioctl verify-install` passes** | `istioctl verify-install` (optionally `-f infrastructure/k8s/istio/istio-operator.yaml` if you install from that file). Expect components **healthy**. | **Operational** — not automated in CI; depends on cluster + install revision. |
| **All (workload) pods have `istio-proxy`** | In injected namespaces: `kubectl get pods -n 1commandai-apps -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{range .spec.containers[*]}{.name}{" "}{end}{"\n"}{end}'` and confirm **`istio-proxy`** beside your app container. **Exclude** system pods (e.g. `kube-system`) unless you explicitly inject them. | **`namespaces/app-namespace.yaml`** sets `istio-injection=enabled`. **Restart** Deployments after labeling. |
| **mTLS enforced — plain client without mesh cert fails** | From a pod **without** a sidecar, call a meshed Service; expect failure or non-200 (e.g. TLS/connection error), while the same call from a **meshed** client succeeds. Example: apply `samples/curl-plainclient-pod.yaml` in `default`, then `kubectl exec curl-plainclient -- curl -sS -m 5 -v http://api.1commandai-apps.svc.cluster.local:3000/` (adjust host/port). | **`mesh/peerauthentication-strict-mtls.yaml`** + **`routing/destinationrules-services.yaml`**. Sample: **`samples/curl-plainclient-pod.yaml`**. |
| **Kiali shows service graph** | Open Kiali → **Graph** → select namespace **`1commandai-apps`** → enable **Traffic** / **Security** (mTLS edges). Generate traffic between services if the graph is empty. | **Kiali** is upstream addon; **`addons/kiali-access.yaml`** wires ingress (optional). |
| **Access logs in Elasticsearch** | Envoy logs are **JSON to stdout** (`istio-operator.yaml`). They reach Elasticsearch only via a **log shipper** (Fluent Bit, Filebeat, Elastic Agent, etc.) tailing **`istio-proxy`** container logs and indexing to ES. See **Elasticsearch** below. | **Configured:** stdout JSON. **Not included:** ES/Fluent Bit Helm charts (platform choice). |
| **No plaintext between meshed services** | With **STRICT** + **`ISTIO_MUTUAL`**, data plane hop between sidecars uses mutual TLS. Verify with **`istioctl authn tls-check`**, Kiali **mTLS** edge badges, and (optionally) packet capture on the **tunnel** port (advanced). Edge ingress may still be HTTP until you add **Gateway TLS**. | **Mesh:** STRICT + DRs. **Ingress:** HTTP in `routing/gateway-public.yaml` until you add TLS — that is **north–south**; **east–west** between injected pods should not use cleartext on the mesh path. |

### `istioctl verify-install`

```bash
istioctl verify-install
# If you installed from the committed operator file:
istioctl verify-install -f infrastructure/k8s/istio/istio-operator.yaml
```

### Sidecar presence (quick check)

```bash
kubectl get pods -n 1commandai-apps -o custom-columns=NAME:.metadata.name,CONTAINERS:.spec.containers[*].name
```

Every application Pod in an injected namespace should list **`istio-proxy`** in addition to your app container.

### mTLS negative test (plain `curl`)

```bash
kubectl apply -f infrastructure/k8s/istio/samples/curl-plainclient-pod.yaml
kubectl wait --for=condition=Ready pod/curl-plainclient --timeout=60s
# Expect failure or TLS/reset when the server enforces STRICT and the client has no sidecar / cert:
kubectl exec curl-plainclient -- curl -sS -m 5 -v http://api.1commandai-apps.svc.cluster.local:3000/ || true
```

Compare with a **meshed** client (e.g. Istio `sleep` sample in `1commandai-apps`) — that call should succeed.

### Kiali graph

1. `kubectl port-forward -n istio-system svc/kiali 20001:20001` (or use ingress + `addons/kiali-access.yaml`).
2. **Graph** → namespace **`1commandai-apps`** → last **1m** or **5m**.
3. Turn on **Display** → **Security** to highlight **mTLS**.

### Access logs → Elasticsearch

This repo enables **JSON access logs on stdout** from each **`istio-proxy`**. To satisfy **“access logs in Elasticsearch”**:

1. Run a **DaemonSet** log collector (common: **Fluent Bit** or **Filebeat**) on each node.
2. **Include** namespaces where your workloads run (e.g. `1commandai-apps`, `istio-system` if needed).
3. **Filter** containers named **`istio-proxy`** (or parse JSON and route `upstream_cluster` / `route_name` fields).
4. **Output** to Elasticsearch (HTTP or cloud ID), with an index template for Istio access log JSON (fields like `method`, `path`, `response_code`, `upstream_service_time`).

Example Fluent Bit `[OUTPUT]` (placeholders — use your ES URL and credentials):

```ini
[OUTPUT]
    Name            es
    Match           kube.var.log.containers.*istio-proxy*
    Host            elasticsearch.your-namespace.svc.cluster.local
    Port            9200
    Index           istio-access-logs
    Suppress_Type_Name On
```

Validate in **Kibana Discover** (or Elastic Discover) with index pattern `istio-access-*`.

### No plaintext (east–west)

- **`istioctl authn tls-check <client-pod>.<ns> <server-svc>.<ns>.svc.cluster.local`** should report **mTLS** when both ends are injected.
- **Kiali** security layer on the graph should show **mutual TLS** on edges between meshed workloads.
- **Gateway** in `routing/gateway-public.yaml` is **HTTP** for ease of setup; add **TLS** (`credentialName` / SDS) for encrypted **ingress** — that is separate from east–west mTLS between sidecars.

## Layout

| Path | Purpose |
|------|---------|
| `istio-operator.yaml` | `istioctl install -f` — production profile, access logs, telemetry helpers |
| `mesh/` | `PeerAuthentication` (STRICT), mesh `DestinationRule` defaults |
| `namespaces/` | App namespace with `istio-injection=enabled` |
| `routing/` | `Gateway`, `VirtualService`, per-service `DestinationRule` templates |
| `addons/` | Kiali ingress (`VirtualService`) |
| `samples/` | Optional manifests for mTLS verification (`curl-plainclient-pod.yaml`) |

Replace placeholder hosts, TLS secrets, and service ports with values from your 1CommandAI Helm/manifests.
