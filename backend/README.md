# Backend (Express + TypeScript)

Type-safe API scaffold: **Express 4.x**, **TypeScript 5** strict, **dotenv** + **Joi** validated **`config`** (`src/config/index.ts`), **InversifyJS** (`container.ts`, `types.ts`), **graceful shutdown** (`src/common/utils/shutdown.ts` — **SIGTERM**/**SIGINT**, HTTP drain, Mongo/Redis hooks, **30s** cap), **Kubernetes health** — **`GET /health/live`** (liveness), **`GET /health/ready`** (readiness: Mongo + Redis), **Helmet**, **CORS**, **Morgan**.

## Path aliases (`tsconfig.json`)

| Alias        | Directory       |
| ------------ | --------------- |
| `@modules/*` | `src/modules/*` |
| `@common/*`  | `src/common/*`  |
| `@config/*`  | `src/config/*`  |

Use **tsc-alias** after `tsc` so compiled `dist/` resolves aliases at runtime.

## BullMQ (background jobs)

- **Typed queues:** `src/infrastructure/queue/queues/` — `signalQueue`, `executionQueue`, `notificationQueue`, `auditQueue` (job interfaces per file).
- **DLQ:** failed jobs (after max retries) go to **`{queue}-dlq`**. **Dashboard:** `GET /api/dlq`. **Manual retry:** `POST /api/dlq/{signals|execution|notifications|audit}/retry/:jobId`. Alerts log to stderr when DLQ depth **> 100**.
- **Workers** + DLQ wiring run after Redis connects; HTTP listens after bootstrap (`server.ts`). Shutdown stops the DLQ cleanup timer and closes **workers + source queues + DLQs** before the Redis client quits.

## OpenAPI

- **UI:** `GET /api/docs` (after the server is running with valid **`.env`**).
- **JSON:** `GET /api/docs/json` — use for clients or codegen.
- **Regenerate TS types** from the spec: `npm run openapi:types` → `src/types/openapi.generated.ts` (also writes **`openapi.json`**, gitignored).

## Environment

1. Copy **`backend/.env.example`** → **`backend/.env`** and set real values (never commit **`.env`**).
2. **`config/index.ts`** loads dotenv, validates **`process.env`** with Joi, and exports **`config`**. Missing or invalid variables throw when the process imports config (e.g. **`npm run dev`** / **`npm run start`**).

## Scripts

```bash
cd backend
npm ci
npm run dev      # nodemon + tsx ESM loader (NodeNext)
npm run build    # emits dist/ + alias rewrite
npm run start    # node dist/server.js (reflect-metadata → validated config → app)
```

**Note:** The operator prompt lists **`ts-node`** — it is installed for tooling parity. **`npm run dev`** uses **`tsx`** for a reliable **NodeNext / ESM** dev loop with this `tsconfig.json`.

## Port

Default **`3000`** via Joi on **`PORT`** (see **`.env.example`**). If the legacy root API also listens on 3000, run one stack at a time or change **`PORT`** in **`.env`**.

## Acceptance criteria (story checklist)

| Criterion                              | Status in this repo | How to verify                                                                                              |
| -------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| **TypeScript compiles without errors** | **Supported**       | `cd backend && npm run build` (runs `tsc` + `tsc-alias`).                                                  |
| **Strict mode enabled**                | **Supported**       | `tsconfig.json`: `strict`, `noImplicitAny`, `strictNullChecks`.                                            |
| **Path aliases resolve**               | **Supported**       | Example: `app.ts` imports `@common/constants.js`; build + `tsc-alias` rewrite `dist/` for Node.            |
| **Express starts on port 3000**        | **Supported**       | Valid **`.env`** → `src/server.ts` uses **`config.port`** (Joi default **3000**).                          |
| **Health endpoint returns 200**        | **Supported**       | `GET /health` → `200` + JSON (`npm run build && npm start` with env set, then `curl`/`Invoke-WebRequest`). |
| **nodemon restarts on changes**        | **Supported**       | `npm run dev` uses **nodemon** `--watch src --ext ts` (restarts when `*.ts` under `src/` change).          |
