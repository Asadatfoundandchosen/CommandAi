# MongoDB Atlas — primary failover and app behavior

**Applies to:** MongoDB Atlas M30+ replica set (3 electable nodes across 3 AWS AZs in `us-east-1`), EKS workload using Mongoose with `readPreference: primaryPreferred`, `retryWrites: true`, `w: majority`, `wtimeoutMS: 5000`.

## What Atlas does

- A **3-node electable** replica set uses **one member per availability zone** in the region (e.g. `us-east-1a`, `us-east-1b`, `us-east-1c`) by default.
- If the **primary** fails or is stopped, Atlas performs **automatic failover** to a healthy secondary (typically **&lt; 1 minute** to elect a new primary; Atlas SLA and timing may vary by incident).

## Verify topology (before or after an incident)

1. Atlas UI → **Project** → **Clusters** → select the cluster.
2. Open **Topology** (or **Overview** / **...** menu depending on UI version) and confirm **3 data-bearing nodes** in **different** availability zones.
3. In **Metrics**, check replication lag is low on secondaries.

## Test failover (non-prod or maintenance window in prod)

1. In Atlas UI, use **...** on the cluster → **Test Failover** (or restart the **current primary** to force an election — labels vary by Atlas version). Prefer **staging** first.
2. Observe a **new primary** elected on another node/AZ.
3. **Data:** With `w: majority` and a healthy majority of nodes, **committed** writes are not expected to be **lost** on failover (standard MongoDB majority semantics). In-flight single-node writes that were not majority-committed can still be at risk; application code should handle write concern errors.
4. **App reconnect:** The Node driver + Mongoose **replica set** connection string and **reconnect** behavior should establish to the new primary, typically within **tens of seconds** under load. The story target **&lt; 30s** is a **reasonable** SLO; measure with a synthetic health check that hits Mongo after failover.

**How to measure &lt; 30s in practice**

- Note **T0** when failover starts (Atlas event or test button).
- Poll `GET /health/ready` (MongoDB + Redis) from a job every **2–5s** and record the first **200** after `mongodb` is ok again, or run a one-off `mongoose.connection.readyState` script in a pod.
- If readiness stays degraded **&gt; 30s**, check **Network** (peering, routes, SGs), **DNS/SRV** for the cluster, and **Atlas project IP Access List** / peering state.

## Operations checklist after unexpected failover

1. Confirm in Atlas **Activity Feed** / **Cluster** events: **new primary** elected.
2. Check **EKS** app logs for transient `MongoNotConnectedError` / `MongoServerSelectionError` (expected briefly); should clear after reconnect.
3. Review **Grafana/Atlas metrics**: connections, op counters, replication lag.
4. If data integrity is in doubt, use **PITR** (Point-in-Time Restore) per organization backup/restore policy (Atlas **Backup**); not a substitute for app-level idempotency.

## References

- Application connection defaults: `backend/src/infrastructure/database/mongoose-options.ts`
- IaC: `infrastructure/terraform/modules/mongodb-atlas/`
