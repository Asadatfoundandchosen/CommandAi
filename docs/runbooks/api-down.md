# Runbook: Platform API down (no Prometheus scrape)

## Symptoms

- Alert **PlatformAPIDown** (P1).
- Grafana / Prometheus: `up{service="platform-api"} == 0`.

## Checks

1. **Pods**: `kubectl get pods -n <app-namespace> -l app.kubernetes.io/name=platform-api` — look for `CrashLoopBackOff`, `ImagePullBackOff`, `Pending`.
2. **Service & endpoints**: `kubectl get svc,endpoints -n <app-namespace> platform-api` — endpoints must list ready pod IPs.
3. **Prometheus targets**: Prometheus UI → **Status → Targets** — find `platform-api` scrape job; read last error (timeout, TLS, 403, connection refused).
4. **NetworkPolicy / mesh**: confirm Prometheus can reach the pod network (Istio mTLS, NP egress from `monitoring` namespace if applicable).

## Mitigation

- Roll back last deployment if correlated.
- Scale replicas: `kubectl scale deployment platform-api -n <ns> --replicas=3`.
- Restore node / CNI if cluster-wide scrape failures.

## Post-incident

- Update `infrastructure/k8s/monitoring/prometheusrules/` selectors if labels (`service`, `namespace`) changed.
- Link traces/logs in incident ticket.
