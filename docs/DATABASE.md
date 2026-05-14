# MongoDB — index strategy (`app_db`)

Multi-tenant data is isolated by **`org_id`**. Indexes are chosen so typical **reads and writes for one organization** are served from **compound keys** that start with **`org_id`**, match **soft-delete** and **time-ordered** access paths, and support **covered** plans when projections line up with the index.

**Related:** sharding and chunk behavior — `docs/mongodb-sharding-strategy.md`. **Apply indexes:** `scripts/mongodb/create-tenant-indexes.mongosh.js`. **Backups (Atlas cloud backup, PITR window, RTO/RPO targets, quarterly drill):** `infrastructure/terraform/modules/mongodb-atlas` (`mongodbatlas_cloud_backup_schedule`), `docs/runbooks/mongodb-restore.md`, `scripts/restore-mongodb.sh`.

## Connection string and pooling

- **Env:** `MONGODB_URI` (required). Optional: `MONGODB_MIN_POOL_SIZE` (default **10**), `MONGODB_MAX_POOL_SIZE` (default **50**). **Connection selection timeout** is **10s** (`serverSelectionTimeoutMS`); **socket** timeout **45s**; **max idle** **30s**; writes **`w: majority`**, `wtimeoutMS: 5000`; **read** `primaryPreferred`, `retryWrites: true`.
- **Code:** `backend/src/infrastructure/database/mongodb.ts` (`getMongooseConnectOptions`, connection **event** logging: `connected`, `open`, `disconnected`, `error`, `reconnected`, `close`). **Do not** create a new `MongoClient` per request — one **pooled** Mongoose connection per process.
- **Format (Atlas SRV):**

  ```text
  mongodb+srv://<USER>:<PASSWORD>@<cluster-host>/<DB_NAME>?retryWrites=true&w=majority&appName=<appId>
  ```

  Use a **dedicated** DB user (least privilege: `readWrite` on `app_db` only if possible). `DB_NAME` may be omitted if you set `MONGODB_URI` with `/app_db` or rely on the default database on the user. The app connects with the URI and applies pool bounds from env. **Total** driver connections to Atlas are roughly **maxPoolSize × number of app processes** (e.g. Kubernetes replicas); keep under the cluster **connection limit** and lower `MONGODB_MAX_POOL_SIZE` when you **scale out** pods.
- **Health:** `GET /health/ready` includes Mongo ping; `GET /health/database` returns pool **min/max** and readiness (for ops, not a substitute for liveness).
- **Metrics (Prometheus):** `GET /metrics` — `mongodb_mongoose_ready_state`, `mongodb_pool_{min,max}_size_config`, `mongodb_pool_connections_in_use`, `mongodb_pool_checkout_total` / `mongodb_pool_checkin_total` (CMAP, same registry as **BullMQ** gauges).

## Read replicas and analytics (secondary reads)

- **When to use the primary (default `mongoose` connection):** all **writes**, and **reads** that must follow a write (strong **read-your-writes**), sessions that depend on the latest state, and **low-latency** product APIs. The default connection uses **`readPreference: primaryPreferred`** and majority writes.
- **When to use the analytics connection:** **reports**, **long aggregates**, **CSV/Parquet exports**, and **BI-style** read-only jobs that can tolerate **replication lag** and should **not** contend with the primary. Implement via **`getReadConnectionForAnalytics()`** in `backend/src/infrastructure/database/analytics-reads.ts` (a **separate** Mongoose `createConnection` when `MONGODB_ANALYTICS_URI` is set), with:
  - `readPreference: "secondaryPreferred"`
  - `maxStalenessSeconds: 90` (env `MONGODB_ANALYTICS_MAX_STALENESS_SECONDS`, overridable)
- **Connection string (analytics):** same cluster host, **different credentials** — a user with **read only** on `app_db` (and **never** the same as `MONGODB_URI` — config rejects an identical string). **Atlas:** add in **Database Access**; for shell automation see `scripts/mongodb/create-analytics-readonly-user.mongosh.js`.
- **Code:** `backend/src/infrastructure/database/mongodb-analytics.ts` — options for the secondary path; `retryWrites: false` on the analytics side (read-focused pool).
- **Read lag (monitoring):** *Authoritative* replication lag is in **Atlas → Metrics → Replica set** (or **Data Explorer** alerts). The app exports **`mongodb_analytics_read_probe_duration_seconds`** and **`mongodb_analytics_read_probe_success`** (admin **ping** RTT to the analytics pool — a **liveness** signal, not a second-by-second oplog diff). If `secondaryPreferred` cannot find a fresh enough secondary within `maxStalenessSeconds`, the **driver** may return an error (fail **closed** for stale data).
- **Per‑replica `maxPool`:** the analytics connection uses a **smaller** default pool (see `MONGODB_ANALYTICS_*_POOL`); tune so **primary** traffic stays protected.

## Base indexes (all listed collections)

Run on: `users`, `accounts`, `departments`, `agents`, `signals`, `organizations`.

| Index | Role |
| ----- | ---- |
| `{ org_id: 1, is_deleted: 1 }` | Tenant + active/inactive filter (`is_deleted: false` in queries) |
| `{ org_id: 1, created_at: -1 }` | **Default list/recent** sort within a tenant (newest first) |
| `{ org_id: 1, updated_at: -1 }` | “Recently changed” and sync-style queries |

**Lead pattern:** `{ org_id: 1, created_at: -1 }` is the primary **compound** shape for “paginated lists per org” and aligns with **covered** queries when you project only fields present in the index (see below).

## Collection-specific indexes

| Collection | Index | Notes |
| ---------- | ----- | ----- |
| `users` | `{ org_id: 1, email: 1 }` **unique** | One email per org among indexed documents. If soft-deleted users must keep the same email, consider a **partial** unique index (`partialFilterExpression: { is_deleted: false }`) in a follow-up migration. |
| `agents` | `{ org_id: 1, account_id: 1, status: 1 }` | List/filter agents by account and state within a tenant. |
| `signals` | `{ org_id: 1, agent_id: 1, created_at: -1 }` | High-volume, time-ordered signal streams per agent. |

## Covered queries (common patterns)

A query **covers** an index when the plan can return results **only** from the index (no document fetch), if:

- The **filter** can use a **prefix** of the index keys (equality on `org_id` first, then optional range/order on the next fields).
- The **projection** includes **only** fields that exist in the index (plus `_id` unless excluded).

**Examples (conceptual):**

- **Covered (if projection is subset of index):** `find({ org_id, is_deleted: false }, { org_id: 1, is_deleted: 1, _id: 0 })` with `{ org_id: 1, is_deleted: 1 }`.
- **Index scan + fetch:** any query that needs fields **not** in the index (e.g. full document body) will still use the index for **filter/sort** but may **fetch** documents.

When designing new APIs, prefer **filter + sort** that match an existing compound index, and use **lean** projections for list endpoints if you need maximum throughput.

## Analyzing queries with `explain()`

After connecting with **mongosh** to the target database (Atlas **Connect** or SRV URI):

1. **Find / aggregate** — use **`executionStats`** (or `allPlansExecution` for comparison):

   ```javascript
   db.getSiblingDB("app_db")
     .signals.find({ org_id: ObjectId("..."), agent_id: ObjectId("...") })
     .sort({ created_at: -1 })
     .limit(50)
     .explain("executionStats");
   ```

2. **What to check**

   - **`winningPlan.inputStage.stage`** (or nested stages): look for **`IXSCAN`** (index) vs **`COLLSCAN`** (bad on large collections).
   - **`totalDocsExamined`** vs **`nReturned`**: should be close for efficient plans; high examination with few returns suggests a poor index or missing filter.
   - **`rejectedPlans`**: usually empty; if present, compare **executionTimeMillis** in `allPlansExecution` when tuning.

3. **Sharded clusters** — `explain` on `mongos` shows **how** the query is **routed**; keep **`org_id`** in the filter for **targeted** shard access (see sharding doc).

4. **Application code** — Mongoose: `Model.find(query).explain("executionStats")` or the collection’s `aggregate().explain()`.

## Operations checklist

- [ ] Run `create-tenant-indexes` after new environments or new collections.
- [ ] Re-run when adding a **new** application collection (extend the script + this doc).
- [ ] In **Atlas** → **Performance Advisor**: review suggested indexes; avoid redundant indexes that bloat **writes** (duplicate prefixes).

## Field naming

Store **`org_id`**, **`created_at`**, **`updated_at`**, **`is_deleted`** on documents as in the base schema in `.cursor/rules/SYSTEM-PROMPT.mdc`. If models use different casing in the app, map in the ODM to these BSON names so indexes and queries match.

## Acceptance criteria (how to verify)

| Criterion | In repo? | How to confirm |
| --------- | -------- | -------------- |
| **Indexes on all collections** | **Partial** — script covers **six** names (`users`, `accounts`, `departments`, `agents`, `signals`, `organizations`). | After deploy, `db.getCollectionNames()` in `app_db`; any **extra** app collection must be added to the script. `db.<coll>.getIndexes()` per collection. |
| **`explain()` → `IXSCAN` (not `COLLSCAN`)** | **Documented** (see above). | Run representative **tenant** `find`/`aggregate` with `.explain("executionStats")` on **production-like** data volume. Expect **`IXSCAN`**; `COLLSCAN` on large collections is a **failure** for those queries. Unindexed one-offs may still `COLLSCAN` — scope “indexed queries” to paths that match the strategy. |
| **Query time &lt; 10ms** | **Not** guaranteed by code. | Use **`executionStats.executionTimeMillis`** in `explain` and/or APM. **&lt; 10ms** is realistic for **index-bound** point/range queries with **small** `limit`, **warm** cache, and app **co-located** with Atlas region; add **network** latency for remote clients. |
| **Index size “reasonable” (&lt; ~10% of data)** | **Not** in repo. | `db.<coll>.stats()` — compare **index** sizes to **`size`** (data). Rule is **heuristic**; many small fields + large payloads can show **low** index/data ratio; **text** or **heavily indexed** collections can be higher. Track **trend** in Atlas. |
| **No duplicate indexes** | Script uses **stable** keys; re-runs are idempotent. | `db.<coll>.getIndexes()` and fail if two indexes have the **same key spec** (MongoDB usually prevents exact dupes). Watch for **redundant** prefixes (e.g. `{ org_id: 1 }` plus `{ org_id: 1, created_at: -1 }`) — not in our base set, but **Performance Advisor** + human review. |
| **Index usage / utilization** | **Not** in app code. | **mongosh:** `db.<coll>.aggregate([{ $indexStats: {} }])` for **access** counts since process start (or use **Atlas** → **Metrics** / **Query Insights** / **Performance Advisor** for longer-term view). **Unused** indexes: candidates to drop after observation window. |
