# Encryption in transit — security runbook

Platform standard: **TLS 1.3** (with TLS 1.2 fallback where required by clients) for **north–south** API traffic; **TLS** to all data stores; **Istio strict mTLS** for **east–west** pod traffic. **No plaintext** credentials or database sessions in staging/production.

## Summary matrix

| Path | Protection | Configuration |
| ---- | ----------- | ------------- |
| **Public API** | HTTPS (TLS 1.3 policy on ALB) | `modules/alb-api-https`, `k8s/base/ingress.yaml` |
| **HSTS** | `Strict-Transport-Security` | `helmet` + `https-security.middleware.ts` |
| **HTTP → HTTPS** | 301 redirect | ALB listener + optional app middleware |
| **MongoDB** | TLS to Atlas | `mongooseTlsOptions` / `tls: true` in deployed envs |
| **Redis** | TLS (`rediss://`) | ElastiCache transit encryption + `REDIS_URL` validation |
| **PostgreSQL** | TLS `sslmode=require` | Connection string + `pg` `ssl` option |
| **OpenSearch** | HTTPS only | `https://` node + `rejectUnauthorized` |
| **Pod ↔ pod** | Istio **STRICT** mTLS | `mesh/peerauthentication-strict-mtls.yaml` |

## 1. API endpoints (ALB + ACM)

### Terraform module

`infrastructure/terraform/modules/alb-api-https/`:

| Setting | Value |
| ------- | ----- |
| **SSL policy** | `ELBSecurityPolicy-TLS13-1-2-2021-06` |
| **Certificate** | ACM (`certificate_arn` or `create_acm_certificate`) |
| **Port 80** | Redirect → **443** (`HTTP_301`) |
| **Port 443** | Forward to API target group |

### Kubernetes (AWS Load Balancer Controller)

`k8s/base/ingress.yaml` annotations:

```yaml
alb.ingress.kubernetes.io/ssl-policy: ELBSecurityPolicy-TLS13-1-2-2021-06
alb.ingress.kubernetes.io/ssl-redirect: "443"
alb.ingress.kubernetes.io/certificate-arn: <ACM_ARN>
```

Set **`alb.ingress.kubernetes.io/certificate-arn`** in overlay patches per environment.

### Application headers

- **`helmet`** HSTS (`max-age` default **365 days**, `includeSubDomains`; `preload` in production).
- **`createHttpsSecurityMiddleware`** — duplicate HSTS + optional **`FORCE_HTTPS_REDIRECT`** (default **on** in staging/prod).

### Verify

1. `curl -sI https://api.<domain>/health/live` — expect **`Strict-Transport-Security`**.
2. `curl -sI http://api.<domain>/health/live` — expect **301** → `https://`.
3. **[SSL Labs](https://www.ssllabs.com/ssltest/)** — target grade **A+** (TLS 1.3, strong ciphers, HSTS, no weak protocols).

## 2. Database connections

### MongoDB Atlas

- Use **`mongodb+srv://`** (TLS by default) or **`mongodb://`** with driver **`tls: true`** (enforced in staging/production via `backend/src/config/tls-policy.ts`).
- Atlas UI: **Network** → confirm TLS required for cluster access.

### Redis (ElastiCache)

- **`transit_encryption_enabled = true`** in Terraform.
- **`REDIS_URL`** must use **`rediss://`** in staging/production (config fails fast on `redis://`).
- App: `backend/src/infrastructure/cache/redis.ts` sets `tls: { rejectUnauthorized: true }` for `rediss`.

### PostgreSQL / TimescaleDB (RDS)

- Connection string: **`?sslmode=require`** (or `verify-full` / `verify-ca`).
- `pg` pool: **`ssl: { rejectUnauthorized: true }`** in deployed envs.
- Terraform output template includes `sslmode=require` in `connection_summary`.

## 3. Internal service communication (Istio mTLS)

### Mesh policy

| Resource | Purpose |
| -------- | ------- |
| `mesh/peerauthentication-strict-mtls.yaml` | **STRICT** — sidecars require mTLS |
| `mesh/destinationrule-mesh-mtls.yaml` | Outbound **ISTIO_MUTUAL** |
| `routing/destinationrules-services.yaml` | Per-service TLS modes |

Namespaces: **`istio-injection: enabled`** on app namespaces.

### North–south TLS on Istio Gateway (optional)

`routing/gateway-public-https.yaml` — HTTPS **443** with **`minProtocolVersion: TLSV1_3`**, HTTP **httpsRedirect**. Mount cert as **`api-gateway-tls`** secret in `istio-system`.

### Verify mTLS

```bash
istioctl authn tls-check <pod>.<namespace> api.<namespace>.svc.cluster.local
kubectl get peerauthentication -A
```

Plain pod without sidecar calling a meshed service should **fail** (see `samples/curl-plainclient-pod.yaml`).

## 4. Configuration reference

### ALB TLS policy (operator prompt)

```hcl
ssl_policy = "ELBSecurityPolicy-TLS13-1-2-2021-06"
```

### Backend environment (staging / production)

| Variable | Requirement |
| -------- | ------------- |
| `SESSION_COOKIE_SECURE` | `true` |
| `REDIS_URL` | `rediss://…` |
| `TIMESCALE_DATABASE_URL` | `sslmode=require` (if set) |
| `OPENSEARCH_NODE` | `https://…` |
| `MONGODB_URI` | Atlas SRV or TLS-enabled |
| `FORCE_HTTPS_REDIRECT` | default **true** in staging/prod |

## 5. Certificate management

| Cert | Source | Rotation |
| ---- | ------ | -------- |
| **Public API** | **ACM** (DNS validation) | Auto-renewed by ACM |
| **Istio Gateway** | Secret `api-gateway-tls` or cert-manager | Sync from ACM or Let's Encrypt |
| **RDS / Atlas** | AWS/Atlas managed | N/A (server certs) |

Store ACM ARNs in Terraform outputs / Vault; wire **`certificate-arn`** on Ingress per env.

## Incident: TLS downgrade or plaintext leak

1. Confirm ALB listener still uses **`ELBSecurityPolicy-TLS13-1-2-2021-06`** (not a legacy policy).
2. Check app logs for config startup errors (`rediss://`, `sslmode`, `SESSION_COOKIE_SECURE`).
3. In mesh: `istioctl proxy-config secret <pod> -n <ns>` — expect SDS certs on injected pods.
4. Re-run SSL Labs after any listener or cert change.

## Related

- **Encryption at rest:** `encryption-at-rest.md`
- **Istio install / verify:** `infrastructure/k8s/istio/README.md`
- **Cookies / CSRF:** `docs/COOKIE-POLICY.md`
