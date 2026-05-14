# MongoDB Atlas — backup, PITR, and restore

**Policy (IaC):** `infrastructure/terraform/modules/mongodb-atlas/main.tf` — `backup_enabled`, `mongodbatlas_cloud_backup_schedule` (hourly snapshots, retention, `restore_window_days` for the PITR lookback in Atlas). **Platform:** `.cursor/rules/SYSTEM-PROMPT.mdc` — **PITR enabled**, **RTO &lt; 1 h** and **RPO &lt; 1 min** as *targets* (achievable with healthy Atlas backup + a rehearsed runbook; actuals depend on incident and restore path).

**Atlas UI:** [Backup & restore](https://www.mongodb.com/docs/atlas/backup-restore/) → project → cluster → **Backup**.

## Verify PITR in Atlas (acceptance / onboarding)

1. **Cluster** (dedicated, M10+ depending on product): open **Backup**; confirm **Cloud backup** (continuous) is **on** (see also Terraform `backup_enabled`).
2. **Point in time** tab / restore dialog: **earliest** and **latest** recoverable time should show a **window** matching policy (IaC default: **`restore_window_days` = 7** — “last 7 days” in product terms; *sub-second* recovery granularity is the usual Atlas PITR behavior inside that window when backups are healthy).
3. If the window is shorter than expected: check **compliance** policies, billing, or support limits on the org.

> **PITR enabled** in this repo = Terraform + documented procedure. **RPO &lt; 1 min** and **RTO &lt; 1 h** are *operational targets* (RPO: choose restore instant near failure; RTO: restore job often **15–30+ min** in Atlas, plus validation and cutover — use **&lt; 1 h** only with proven automation and a **new** cluster in the same region).

## Point-in-time recovery (PITR) — operator runbook

### 1) Identify the target **UTC** timestamp

- Prefer **1–2 minutes *before* the bad transaction** (not after), in **UTC** (use incident logs, application `created_at`, oplog, or `mongod` metadata).
- Confirm the instant lies inside the **PITR window** shown in Atlas (must be ≤ **7** days in default IaC, subject to Atlas).

### 2) Choose restore **target**

- **Recommended for production safety:** new cluster in the same or a staging project, e.g. `app-restored-pitr-<date>`, then **validate** before any cutover.
- Record **source** `clusterName`, **project (group) id**, and **new** `targetClusterName` (globally unique name within the target project’s naming rules).

### 3) Create the restore job

**Option A — `scripts/restore-mongodb.sh` (Atlas API v2)**

- API key: **Project Backup** recovery role (or Backup Manager) on the project.
- Set env vars (see script header) and `PITR_UTC=2025-12-15T14:32:00Z` (or `PITR_UNIX_SECONDS`). Run:
  - `./scripts/restore-mongodb.sh` — returns quickly with **job id**.
  - `./scripts/restore-mongodb.sh --wait` — **polls** until the job has `finishedAt` or **failed** (often **15–30+ minutes**; may exceed **1 h** on large clusters—adjust RTO expectations).

**Option B — Atlas UI**

- **Backup** → **Restore** → **Point in time** → set **UTC** time → target **new cluster** name → start job.

**Option C — Atlas CLI**

- `atlas backups restores start` (see [Atlas CLI](https://www.mongodb.com/docs/atlas/cli/)); same semantics as the API.

### 4) Wait and monitor

- Watch the job: UI or `GET` restore job (script prints poll URL). **Do not** switch production traffic until validation passes.
- If the job **fails** or is **cancelled**: open a case with MongoDB; keep the **old** connection strings until rollback is clear.

### 5) Validate data integrity (on the **new** cluster)

Connect with a **read** user; run at minimum:

```javascript
// mongosh
use app_db
db.runCommand({ ping: 1 })
// Collections exist
db.getCollectionNames()
// Sample tenant-scoped read (replace ObjectId)
db.getCollection("users").find({ org_id: ObjectId("…") }).limit(3)
db.getCollection("signals").countDocuments({ org_id: ObjectId("…") })
// Optional: compare to a pre-incident count from BI / audit
```

- **Application smoke:** from a private runner or jump host, set `MONGODB_URI` to the **new** SRV, run `GET /health/ready` and a **read-only** product API path in **staging** first.

### 6) Switch connection string (cutover) or decommission

- **Cutover to restored cluster** (maintenance window): update **Vault** / K8s **Secret** for `MONGODB_URI` to the new cluster; **roll** pods; verify **/health/ready** and a **canary** tenant.
- If this was a **drill** only: **delete** the throwaway cluster after sign-off to avoid **cost** and **name** collisions; retain **evidence** (job id, timestamp) in the ticket.

**Atlas API ref:** [Create One Restore Job](https://www.mongodb.com/docs/api/doc/atlas-admin-api-v2/operation/operation-creategroupclusterbackuprestorejob/) (`deliveryType: "pointInTime"`, `pointInTimeUTCSeconds`).

## Rollback plan (if something goes wrong *after* a bad cutover)

- **Keep** the old cluster and connection string **in Vault history** (or a backup Secret) for **N hours** after cutover.
- **If** the new cluster is unhealthy: set `MONGODB_URI` back to the **previous** cluster (last known good), **redeploy**; open an incident for data delta between PITR instant and switch-back time.
- **If** only the **new** PITR cluster is wrong but **old** is still up: do **not** delete the old cluster until sign-off. Delete only the **failed** restored cluster in Atlas to free names and spend.

## Snapshot-based restore (outside PITR window)

- If the incident is **older** than the PITR window, use a **named snapshot** in **Backup** instead of PITR; same **new cluster** and validation flow.

## Other backups & alerts

- **Hourly** snapshots, **30-day** retention, and **7-day** PITR lookback: see Terraform `mongodbatlas_cloud_backup_schedule` and `backup_enabled` on the cluster.
- **Atlas** → project → **Alerting:** enable **backup / snapshot failed** (or equivalent) and route to Slack / PagerDuty using patterns in `infrastructure/k8s/monitoring/helm-values/alertmanager-routing.example.yaml` for production.

## Quarterly PITR / restore test

- **Schedule:** **4× per year** (e.g. first week of each quarter) — see `.github/workflows/mongodb-restore-test-reminder.yml` (cron: Jan / Apr / Jul / Oct 1st).
- **Test:** in **dev/staging** project, run a **PITR** to a throwaway `…-pitr-test-<date>` cluster **1 h back**; run **validation** queries; **delete** cluster; **record** ticket: date, operator, PITR second used, pass/fail.
- The workflow only **reminds**; the **quarterly** test is still **manual**.

## Related

- **Failover** of live **primary** (not restore from backup): `docs/runbooks/mongodb-failover.md`
- **Data layer:** `docs/DATABASE.md`
- **Script:** `scripts/restore-mongodb.sh`
- **IaC:** `infrastructure/terraform/modules/mongodb-atlas/`
