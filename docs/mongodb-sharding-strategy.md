# MongoDB sharding strategy (per-tenant scale)

## Principles

- **Tenant isolation** uses **`org_id`** on every document (see platform security rules). For horizontal scale, the **shard key** is **`{ org_id: "hashed" }`** so writes and reads for a given organization map to a predictable chunk and Atlas can **split / migrate** chunks as data grows.
- **Hashed** sharding provides **even distribution** when `org_id` is a high-cardinality `ObjectId` (or string with many distinct values). Low-cardinality shard keys cause **jumbo chunks**—avoid.
- **Atlas** runs **config servers**, **mongos** routing, and **shard** processes; **chunk balancing** and **add/remove shards** are **managed in Atlas** (no self-hosted config servers in our stack).

## Prerequisites

1. **Sharded cluster** in MongoDB Atlas (not a single replica set). Provision an **M30+ sharded** deployment in the same project/region policy as `infrastructure/terraform/modules/mongodb-atlas`, or create a new cluster in Atlas and peer it similarly.
2. **Application** uses **`app_db`** (or the same **database name** as in this document) and every tenant-scoped collection includes **`org_id`**.

## One-time enablement (mongosh)

From a host that can reach the cluster (e.g. **Atlas → Connect → Shell** or `mongosh` with SRV URI):

1. Run **`scripts/mongodb/shard-app-collections.mongosh.js`** (copy-paste or `load()`), or execute the commands manually in order:
   - `sh.enableSharding("app_db")`
   - For each collection: `sh.shardCollection("app_db.<name>", { org_id: "hashed" })`

2. **Order matters**: create collections (or let the app create them) **before** sharding, or ensure collections are **empty** when sharding. If a collection already has data, you must have a **compatible index**; for **`{ org_id: "hashed" }`**, `shardCollection` can create the index when requirements are met (see [MongoDB docs](https://www.mongodb.com/docs/manual/core/hashed-sharding/)).

3. **New collections** added after go-live: add them to the script and run `shardCollection` again, or add a migration step in release notes.

## Collections to shard (tenant data)

| Collection     | Notes                              |
| -------------- | ---------------------------------- |
| `users`        | Scoped by `org_id`                 |
| `accounts`     | Business unit / account            |
| `departments`  | Department under account           |
| `agents`       | Agent records                      |
| `signals`      | High volume — primary growth path  |
| `organizations` | Or `orgs` if that is the collection name |

Adjust names to match your ODM models. **Do not** shard local/admin; **config** is internal to the cluster.

## Read / write behavior

- Application continues to use **`mongoose-options.ts`**: `readPreference: primaryPreferred`, `w: majority`. Routers send queries to the right shard(s) based on the query and shard key.
- **Scatter-gather** queries (e.g. aggregations without `org_id` filter) are expensive—**always filter by `org_id`** in application code (already required for security).

## Monitoring chunk distribution

- **Authoritative view**: **Atlas → Project → Your sharded cluster → Metrics** (or **... → Chunks** / **Performance Advisor** depending on UI version) for **chunk counts**, **balancer** state, and **jumbo** chunk alerts.
- **Grafana**: `infrastructure/k8s/monitoring/grafana/dashboards/mongodb-shard-chunks.json` links to this page and reserved space for **PMM** or **mongodb_exporter** metrics if you self-host metrics later.
- **Alerts**: In Atlas, configure **alerts** for **sharding** / **migration** / **chunk** issues; mirror critical ones to PagerDuty/Slack per `infrastructure/k8s/monitoring/`.

## Terraform

- The current **`mongodb-atlas`** module targets a **3-node replica set** for non-sharded workloads. For **sharded** topology, add a **sharded** Atlas cluster in Terraform (or create in UI) and document the connection string in Vault. **Atlas** still **manages** shard processes and **automatic balancing** once `shardCollection` is applied.

## References

- Indexes (compound tenant queries, `explain()`): `docs/DATABASE.md`
- Runbook: `docs/runbooks/mongodb-failover.md` (replica set; for sharded clusters, failover is per-shard + config — see Atlas docs).
- Script: `scripts/mongodb/shard-app-collections.mongosh.js`
