# Redis (ElastiCache cluster mode / Redis 7+)

## Topology

- **6 nodes** in **cluster mode**: 3 **primary** shards, **1 read replica** per primary (6 nodes total; Terraform: `replicas_per_node_group = 1`).

## Application configuration

- **`REDIS_MODE=cluster`** for **ioredis** `Cluster`; **`REDIS_MODE=standard`** for local or single-node Redis.
- Set **`REDIS_URL`** to the **cluster configuration endpoint** (ElastiCache) with the auth token, for example:  
  `rediss://:REDIS_AUTH_TOKEN@clustercfg.<id>.<region>.cache.amazonaws.com:6379`
- Password and URL must be loaded from your secret store (e.g. **HashiCorp Vault**) at deploy time; do not commit secrets to git.

## TLS and encryption

- **At rest:** **AES-256** via ElastiCache **`at_rest_encryption_enabled`** (Terraform default **true**). Keys are **AWS-managed** (ElastiCache does not support customer CMK for at-rest).
- **In transit:** **`transit_encryption_enabled`** — use **`rediss://`** in `REDIS_URL`.
- The backend enables TLS for `rediss` URLs and sets `tls.rejectUnauthorized` in code.
- Full matrix: **`docs/runbooks/encryption-at-rest.md`**.

## Bull / BullMQ and Redis Cluster

- BullMQ requires **`maxRetriesPerRequest: null`**; the shared client in `backend/src/infrastructure/cache/redis.ts` is configured accordingly.
- For **Redis Cluster**, place keys that must live on one slot in a **hash tag** (e.g. `{name}`) when using multiple keys in one command or for queue naming consistency.

## Terraform

- Reusable module: `infrastructure/terraform/modules/redis-cluster-elasticache/`.

## Related

- `backend/src/infrastructure/cache/redis.ts` — **cluster vs standard**, **retry** / backoff, **shared** connection for the API and **BullMQ**.
