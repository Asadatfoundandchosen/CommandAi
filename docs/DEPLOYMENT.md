# Deployment and environment promotion

This document describes how code moves from **dev** → **staging** → **prod** using **GitHub Actions** and **GitHub Environments**, alongside **Argo CD** (`infrastructure/argocd/`) and **Kustomize** overlays (`k8s/overlays/`).

## Summary

| Stage       | Trigger                                      | Protection                     | Intended approvers                   |
| ----------- | -------------------------------------------- | ------------------------------ | ------------------------------------ |
| **dev**     | Merge to `main` (automatic workflow)         | None                           | CI + merge rules on `main`           |
| **staging** | Manual **Run workflow** → target **staging** | GitHub Environment **staging** | **qa-team** (required reviewers)     |
| **prod**    | Manual **Run workflow** → target **prod**    | GitHub Environment **prod**    | **Two** approvals from **prod-team** |

**Dev auto-deploy on merge.** Staging and prod use **manual** workflow runs so promotion is explicit; **Environment** rules enforce QA and dual prod approval.

## GitHub Environments (one-time setup)

In the repository: **Settings** → **Environments** → create or edit:

### `dev`

- **Deployment branches**: All branches (or limit to `main` only if you prefer).
- **Required reviewers**: none.
- No wait timer required for rapid iteration.

### `staging`

- **Required reviewers**: add the **`qa-team`** team (or named individuals who represent QA).
- Optional: **Wait timer** (e.g. 5 minutes) if you want a cooling-off period before deploy executes after approval.

### `prod`

- **Required reviewers**: add **two** distinct approvers from **prod-team** (or add **`prod-team`** twice if your org policy requires two separate people—configure per [GitHub deployment protection](https://docs.github.com/en/actions/deployment/targeting-different-environments/using-environments-for-deployment#deployment-protection-rules)).
- On **GitHub Enterprise** you can set a **minimum number of reviewers** for custom deployment policies; on **GitHub.com**, add multiple required reviewers so that **two approvals** are required before the job runs (exact UI depends on your plan; use **Deployment protection rules** as needed).

### Secrets

| Secret                                   | Used by                                                                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `SLACK_WEBHOOK_URL`                      | `deploy.yml`, `rollback.yml` — deployment / rollback / hook notifications                                      |
| `HEALTH_CHECK_URL_DEV`                   | Base URL (no trailing slash) for public or ingress URL to the **dev** API — enables post-deploy `/health` gate |
| `HEALTH_CHECK_URL_STAGING`               | Same for **staging**                                                                                           |
| `HEALTH_CHECK_URL_PROD`                  | Same for **prod**                                                                                              |
| `REDIS_URL`                              | Optional — `scripts/record-deploy-redis.sh` writes deployment JSON to list **`deploy:history:<env>`**          |
| `ARGOCD_SERVER`, `ARGOCD_AUTH_TOKEN`     | `rollback.yml` — Argo CD CLI (`argocd app rollback` or `argocd app sync --revision`)                           |
| (future) `AWS_ROLE_ARN`, ECR, kubeconfig | Real deploy steps: push image, `kubectl` / Argo CD API                                                         |

Create secrets under **Settings** → **Secrets and variables** → **Actions** (repository or environment-scoped).

## Workflows

### `Deploy` (`.github/workflows/deploy.yml`)

- **On push to `main`**: runs **Deploy to dev** (`environment: dev`). Replace the placeholder step with your real **ECR push** and **Argo CD sync** (or image tag update) for the **dev** overlay.
- **Workflow dispatch**: choose **staging** or **prod**. GitHub will pause the job until **Environment** approvals are satisfied, then run the deploy steps.
- **Post-deploy health**: after each successful deploy job, a **verify** job waits **2 minutes**, then polls **`GET {HEALTH_CHECK_URL_*}/health`** for up to **5 minutes** total from the start of that check loop. If the check fails, the workflow dispatches **`Rollback`** with **`target_revision`** set to the **previous git commit** (`github.event.before` on `main` for dev; `HEAD^` for staging/prod workflows). If health URL secrets are unset, the gate is skipped (no auto-rollback).
- **Redis history**: after a successful deploy, **`scripts/record-deploy-redis.sh`** runs when **`REDIS_URL`** is set (uses Docker **`redis:7-alpine`** on the runner).

### `Rollback` (`.github/workflows/rollback.yml`)

- **Manual rollback button**: **Actions** → **Rollback** → **Run workflow** — inputs **`environment`**, **`target_revision`** (numeric Argo **history id** for `argocd app rollback`, or **git ref** for `argocd app sync --revision`).
- **Automated**: invoked by failed post-deploy health jobs in **Deploy** (requires **`actions: write`** on the default token, already set in `deploy.yml`).
- **Argo CD CLI**: set **`ARGOCD_SERVER`** and **`ARGOCD_AUTH_TOKEN`**. If unset, the workflow completes with a warning and documents manual commands.
- Uses the same **GitHub Environment** as deploy (staging/prod approvals apply).

**Rollback time target (&lt; 30s)** in-cluster is usually met with **Argo CD → History → Rollback** or `kubectl rollout undo` when old ReplicaSets still exist—measure in your environment.

### Argo CD resource hooks (`k8s/base/hooks/`)

Synced with the API manifests (included from `k8s/base/kustomization.yaml`):

| Hook         | Job                        | Purpose                                                                                                          |
| ------------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **PreSync**  | `job-presync-migrate.yaml` | Placeholder migration — replace image/command with your migrator.                                                |
| **PostSync** | `job-postsync-health.yaml` | `curl` **`http://platform-api/health`** in-cluster after sync.                                                   |
| **SyncFail** | `job-syncfail-slack.yaml`  | Posts to Slack if **`platform-hook-secrets`** / **`slack-webhook-url`** exists (see `secret-hook.example.yaml`). |

Apply **`secret-hook.example.yaml`** (or ExternalSecrets) per namespace if you want SyncFail Slack alerts.

## Promotion flow (recommended)

1. **Feature branch** → open PR → **CI** green → review → merge to **`main`**.
2. **Dev**: **Deploy** workflow runs automatically; **Argo CD** (if wired) syncs **`k8s/overlays/dev`** with the new image tag.
3. **Staging**: When QA is ready, run **Deploy** manually with **staging**; after **qa-team** approves, staging receives the promoted build.
4. **Prod**: Run **Deploy** with **prod**; after **two** prod approvals, production is updated.

Keep **image tags** or **Kustomize** `newTag` values traceable (e.g. git SHA) so staging and prod promote known artifacts.

## Slack

Workflows post to Slack when **`SLACK_WEBHOOK_URL`** is set. Payloads include workflow name, status, SHA (deploy), and link to the Actions run. If the secret is missing, the step logs and skips (does not fail the job).

## Argo CD alignment

- **Dev** Application uses **auto-sync**; merges to `main` that change manifests can still be picked up by Argo on refresh.
- **Staging** and **prod** Applications use **manual sync**; the **Actions** pipeline represents **human-gated promotion**; operators may still **Sync** in Argo after the image/tag is updated by the workflow (or automate sync in the workflow with credentials).

For details on Argo applications and RBAC, see `infrastructure/argocd/README.md`.

## Deployment history in Redis

Each successful deploy appends a JSON object to list key **`deploy:history:dev`**, **`deploy:history:staging`**, or **`deploy:history:prod`** (LPUSH). Fields include **`sha`**, **`time`** (UTC ISO8601), **`actor`**, **`run_id`**, **`workflow`**. Trim lists in production (e.g. **`LTRIM`** to last N entries) via cron or application logic.
