# Backend architecture (`backend/`)

The **`backend/`** package is a **feature-based**, **layered** Express API: routes are thin, controllers orchestrate, services hold domain logic, validation uses **Zod**, and infrastructure (DB, cache, queue) stays at the edges.

## Principles

- **Feature-based modules** — One folder per domain (`users`, `agents`, `signals`, `auth`). Each feature owns its HTTP surface and domain code.
- **Separation of concerns** — **Routes** wire paths; **controllers** map HTTP ↔ services; **services** implement use cases; **models** define types; **validation** defines request/response schemas.
- **Consistent file naming** — `{feature}.{role}.ts` (e.g. `users.service.ts`, `users.routes.ts`).

## Directory layout

```text
backend/src/
├── app.ts                 # createApp(container) — middleware + route mounting
├── server.ts              # config → listen → register graceful shutdown (HTTP → Mongo → Redis)
├── container.ts           # Inversify Container — bind services & controllers
├── types.ts               # TYPES injection symbols (Symbol.for)
├── modules/               # @modules/* — product features
│   ├── users/
│   │   ├── index.ts       # barrel — public exports for this module
│   │   ├── users.model.ts
│   │   ├── users.repository.ts
│   │   ├── users.service.ts
│   │   ├── users.controller.ts
│   │   ├── users.routes.ts
│   │   ├── users.validation.ts
│   │   └── users.test.ts
│   ├── agents/
│   │   ├── index.ts
│   │   └── agents.service.ts
│   ├── signals/index.ts
│   └── auth/
│       ├── index.ts
│       └── auth.service.ts
├── common/                # @common/* — shared, non-feature code
│   ├── constants.ts
│   ├── health/          # GET /health/live, /health/ready (K8s probes)
│   ├── middleware/
│   ├── utils/
│   │   └── shutdown.ts  # SIGTERM/SIGINT, drain HTTP, DB/Redis cleanup, 30s cap
│   ├── types/
│   └── validators/
├── config/                # @config/* — dotenv + Joi validated env → type-safe `config`
│   ├── index.ts           # `dotenv.config()`, Joi schema, `export const config`
│   ├── database.ts        # `databaseConfig` derived from `config.mongodb`
│   ├── redis.ts           # `redisConfig` derived from `config.redis`
│   └── swagger.ts         # `swagger-jsdoc` spec (JSDoc `@openapi` in routes)
└── infrastructure/        # adapters — drivers, clients (no HTTP)
    ├── database/
    ├── cache/
    └── queue/
        ├── connection.ts      # Shared Redis connection for BullMQ
        ├── queues/            # Typed Queue + job interfaces per workload
        ├── dlq/               # DLQ wiring, dashboard/retry routes, retention cleanup
        ├── queue.service.ts   # createWorker + re-export queues
        └── queue.workers.ts   # Worker instances; start after Redis connect
```

## OpenAPI (Swagger)

- **`config/swagger.ts`** builds the spec with **`swagger-jsdoc`** from **`@openapi`** JSDoc blocks in **`*.routes.ts`** / **`*.controller.ts`** under **`modules/`** and **`common/`**.
- **`GET /api/docs`** — **Swagger UI** (`swagger-ui-express`). **`GET /api/docs/json`** — raw OpenAPI JSON (for codegen).
- **`npm run openapi:types`** — writes **`openapi.json`** and generates **`src/types/openapi.generated.ts`** via **`openapi-typescript`** (regenerate when routes change).

## Configuration

- **`backend/.env.example`** lists required variables; copy to **`backend/.env`** locally (never commit secrets).
- **`config/index.ts`** calls **`dotenv.config()`**, validates **`process.env`** with **Joi**, and exports **`config`** plus **`AppConfig`**. Invalid or missing values throw at startup (**fail fast**).
- **`database.ts`** / **`redis.ts`** expose slices for code that prefers `databaseConfig` / `redisConfig` while staying aligned with the validated root object.

## Path aliases (`backend/tsconfig.json`)

| Alias        | Maps to         |
| ------------ | --------------- |
| `@modules/*` | `src/modules/*` |
| `@common/*`  | `src/common/*`  |
| `@config/*`  | `src/config/*`  |

Production builds run **`tsc`** then **`tsc-alias`** so Node resolves imports in **`dist/`**.

## Health checks (Kubernetes)

- **`GET /health/live`** — **liveness**: returns **`200`** + `{ status: "ok", timestamp }` if the Node process is serving HTTP (no dependency checks).
- **`GET /health/ready`** — **readiness**: **`200`** when **MongoDB** (mongoose `admin().ping()`) and **Redis** (ioredis `PING`) succeed; **`503`** + `degraded` if any check fails (pod removed from Service endpoints).
- **`GET /health`** — alias for liveness (legacy probes).
- **`k8s/base/deployment.yaml`**: **livenessProbe** → `/health/live`, **readinessProbe** → `/health/ready`, **startupProbe** → `/health/live` with **`failureThreshold: 30`**.

## Background jobs (BullMQ)

- **`REDIS_URL`** is parsed in **`config/index.ts`** into **`config.redis.connection`** (**`host`**, **`port`**, optional auth/TLS) for **BullMQ** and the cache client.
- **`infrastructure/queue/queues/`** — one file per workload: **`SignalJob`** / **`signalQueue`** (high volume, **`removeOnComplete`/`removeOnFail`** caps), **`ExecutionJob`** / **`executionQueue`** (critical, **`priority: 1`**, more retries), **`NotificationJob`** / **`notificationQueue`** (lower priority, longer backoff), **`AuditJob`** / **`auditQueue`** (durable audit trail).
- **`queue.service.ts`** exports **`createWorker`** (**concurrency** 5, **rate limit** 100 jobs/s) and the **`queues`** map for shutdown.
- **`queue.workers.ts`** registers typed stub processors; **`startBullMqWorkers()`** + **`initAllDlqHandlers()`** run after **`connectRedis`** (HTTP **`listen`** only after this bootstrap in **`server.ts`**).
- **Dead-letter**: **`dlq/setup-dlq.ts`** attaches **`Worker`** **`failed`** handlers — when **`attemptsMade` ≥ max attempts,** jobs are copied to **`{name}-dlq`** with error metadata; **`dlq/alert.service.ts`** logs when DLQ **waiting** exceeds **100**; **`GET /api/dlq`** exposes counts; **`POST /api/dlq/:queueName/retry/:jobId`** re-queues **`originalJob`**; **`dlq/dlq.cleanup.ts`** removes DLQ jobs older than **30 days** (daily).

## Graceful shutdown

- **`common/utils/shutdown.ts`** exports **`GracefulShutdown`** and **`gracefulShutdown`**; **`SIGTERM`** / **`SIGINT`** trigger **`shutdown()`** once (idempotent).
- Callback order in **`server.ts`**: **`server.close()`** (stop accepting, drain in-flight HTTP), **`disconnectMongo()`**, **`closeBullMqQueuesAndWorkers()`**, **`quitRedis()`**. Mongo/Redis app client hooks are no-ops until **`registerMongoDisconnect`** / **`registerRedisQuit`** are set when clients are wired.
- A **30s** timer forces **`process.exit(1)`** if shutdown does not finish.

## Dependency injection (InversifyJS)

- **`reflect-metadata`** is loaded first in **`server.ts`** (required for **`@inject()`** metadata).
- **`types.ts`** exports **`TYPES`** (`UserRepository`, `UserService`, `AgentService`, `AuthService`, …).
- **`container.ts`** binds implementations in **singleton** scope and exports **`container`**.
- **`createApp(container)`** passes the container into route factories (e.g. **`createUsersRouter(container)`**), which resolve **`UsersController`** from the container.
- Domain classes use **`@injectable()`**; constructor dependencies use **`@inject(TYPES.…)`**.

## Request flow

1. **`server.ts`** imports **`reflect-metadata`** and validated **`config`**, then builds the app with **`createApp(container)`**, listens, and registers shutdown hooks.
2. **`app.ts`** applies security/logging middleware and mounts feature routers (e.g. **`/api/users`** from **`createUsersRouter(container)`**).
3. **Router** → **controller** (from container) → **service** → **repository** / **`infrastructure/`**.

## Multi-tenancy

Platform rules (**`org_id` from JWT**, never from body) apply when auth is wired: validate in middleware, pass **`tenantId`** into services, and scope all persistence queries.

## Related docs

- **Deployment / GitOps**: `docs/DEPLOYMENT.md`
- **Branch protection**: `docs/BRANCH_PROTECTION.md`
- **Backend package README**: `backend/README.md`
