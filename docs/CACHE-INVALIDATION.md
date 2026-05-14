# Response cache invalidation (coherence)

## Strategy

- **Read path**: `GET` JSON is cached in Redis (cache-aside) with per-path TTL (`common/middleware/cache.middleware.ts`). Keys: `cache:resp:{org}:{path}:{qhash}`; `org` comes from tenant resolution, not the body.
- **Tag-based keys**: For each successful `SET`, the response key is also added to one or more **tag sets** (`SADD` on `cache:tag:{org}:r:{resource}…`). Tags are derived from the first path segment after `/api`[/`v1`] (e.g. `webhooks`) and, for detail routes, a second segment that looks like a **record id** (24-char hex or UUID). Subroutes `deliveries` and `dispatch` are not treated as ids.
- **Write path (invalidate on write)**: Mutations call `requestCacheInvalidation({ orgId, resource, id? })` from `infrastructure/cache/invalidation.ts`. The payload is emitted on the in-process bus as `Events.CACHE_INVALIDATION_REQUESTED` and a single subscriber removes cached responses by:
  1. `SMEMBERS` on the relevant tag set(s),
  2. `DEL` each **response** key (safe one-by-one for Redis Cluster),
  3. `DEL` the tag set(s), and
  4. when clearing an entire `resource` without an `id`, `SCAN` of `…:i:*` to drop entity-scoped tags.

We avoid a global **`KEYS` + pattern** on the response namespace; invalidation is driven by the tag index.

## Decoupling

- HTTP handlers do not call Redis invalidation **directly**; they `emit` after success so the handler can evolve (e.g. move to a worker) without bloating controllers.

## Metrics (Prometheus)

- `cache_invalidation_runs_total` — `resource`, `scope` (`all` | `id` | `event`)
- `cache_invalidation_keys_removed_total` — `resource`

Scraped on `GET /metrics` with the rest of the queue/monitoring registry.

## Alignment with mutations

- **Webhooks** (`modules/webhooks/webhook.controller.ts`): create, delete, broadcast, and deliver all request invalidation for `resource: "webhooks"` and `id` when a specific webhook is targeted.

## Operational notes

- Stale **members** in a tag set pointing at an already-expired response key result in a no-op `DEL`; full consistency still relies on TTLs for entries that are never tagged (e.g. a path with no tag mapping).
- Toggling the read cache: `config.responseCache.enabled` — if disabled, tags are not written and invalidation is a no-op when Redis is absent.
