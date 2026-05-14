# Argo CD (GitOps)

Declarative cluster state from this repo: **Argo CD** reads `k8s/overlays/{dev,staging,prod}` and reconciles namespaces `1commandai-*`.

Promotion gates (GitHub Actions + Environments), post-deploy health, Redis history, and **Argo resource hooks** under [`k8s/base/hooks/`](../../k8s/base/hooks/) are documented in [`docs/DEPLOYMENT.md`](../../docs/DEPLOYMENT.md).

## Install control plane

If your runbook uses `kubectl apply -f argocd-install.yaml`, generate that file from the pinned tag (or use Kustomize below, which is what this repo tracks).

```bash
kubectl create namespace argocd
kubectl apply -k infrastructure/argocd/install
```

Wait for pods, then expose the UI (port-forward, Ingress, or LoadBalancer) per your platform standard.

## Bootstrap Applications + AppProject

```bash
kubectl apply -k infrastructure/argocd/bootstrap
```

## Sync policy

| Environment | Argo CD behavior |
|-------------|------------------|
| **dev** | Auto-sync + prune + self-heal |
| **staging** | Manual sync; only `staging-sync` OIDC group can sync (see `projects/appproject.yaml`) |
| **prod** | Manual sync; only `prod-approver` OIDC group can sync (stronger separation / approval) |

Pair prod with **GitHub** branch protection and **Environment** required reviewers on the workflow that updates prod image tags or overlay revisions.

## SSO (GitHub OAuth via Dex)

1. Create a GitHub OAuth App: callback `https://<ARGOCD_HOST>/api/dex/callback`.
2. Store client ID/secret in **Vault** (e.g. `secret/data/platform/argocd/github-oauth`) and sync with **External Secrets** using `vault/external-secret-argocd-dex.example.yaml`, or apply `sso/dex-github-secret.example.yaml` once from a secure pipeline (never commit secrets).
3. Merge `url` and `dex.config` from `sso/argocd-cm-dex-github.example.yaml` into the live `argocd-cm` and restart `argocd-dex-server` / `argocd-server` as needed.

Map GitHub teams to Argo CD groups in `argocd-rbac-cm` (`policy.csv`) and align with AppProject `roles[].groups`.

## RBAC

- AppProject **roles** (`infrastructure/argocd/projects/appproject.yaml`) scope who may sync which Application.
- Global policies: start from `rbac/argocd-rbac-cm.example.yaml` and merge into `argocd-rbac-cm`.

## Vault: initial admin password

1. Read once: `kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d`
2. Write to Vault (e.g. KV v2 `secret/data/platform/argocd` key `initial_admin_password`) and record rotation owner.
3. Change the admin password in Argo CD UI, then **delete** `argocd-initial-admin-secret` or rotate per security policy.
4. Day-2 admin access: SSO groups → `role:admin` in `policy.csv`, not the bootstrap password.

## Pin and `argocd-install.yaml`

Upstream install is pulled via `install/kustomization.yaml` (pinned tag). To match docs that reference a single file, run `kubectl apply -k infrastructure/argocd/install` from the repo root.
