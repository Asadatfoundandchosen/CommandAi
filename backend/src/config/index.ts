import dotenv from "dotenv";
import Joi from "joi";

dotenv.config();

const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "staging", "production")
    .required(),
  PORT: Joi.number().default(3000),
  MONGODB_URI: Joi.string().required(),
  /**
   * Driver pool per process. Default **10–50**; scale with replica count
   * so **pods × maxPool** stays within Atlas connection limits.
   */
  MONGODB_MIN_POOL_SIZE: Joi.number().integer().min(0).default(10),
  MONGODB_MAX_POOL_SIZE: Joi.number().integer().min(1).max(200).default(50),
  /**
   * Optional **TimescaleDB** / PostgreSQL 15 URI for signal time-series (`signal_metrics` hypertable).
   * Load from **Vault** in prod — empty = feature disabled.
   */
  TIMESCALE_DATABASE_URL: Joi.string().allow("").default(""),
  TIMESCALE_POOL_MIN: Joi.number().integer().min(0).default(0),
  TIMESCALE_POOL_MAX: Joi.number().integer().min(1).max(100).default(20),
  /**
   * **Amazon OpenSearch Service** 2.x (ES **8.x**–compatible) — VPC endpoint hostname or full `https://` URL.
   * Empty = disabled. User/password from **Vault** when using fine-grained access.
   */
  OPENSEARCH_NODE: Joi.string().allow("").default(""),
  OPENSEARCH_USERNAME: Joi.string().allow("").default(""),
  OPENSEARCH_PASSWORD: Joi.string().allow("").default(""),
  /**
   * **S3** bucket for **documents** / **exports** (from Terraform: `1commandai-files-<env>`). Empty = not used.
   * Region must match the bucket; inject from **Vault** / ConfigMap in prod.
   */
  S3_FILES_BUCKET: Joi.string().allow("").default(""),
  S3_FILES_REGION: Joi.string().allow("").default(""),
  S3_FILES_KMS_KEY_ARN: Joi.string().allow("").default(""),
  /** Read-only SRV/URI (dedicated `read@...` user) for analytics / reports. Empty = not used. */
  MONGODB_ANALYTICS_URI: Joi.string().allow("").default(""),
  MONGODB_ANALYTICS_MIN_POOL_SIZE: Joi.number().integer().min(0).default(0),
  MONGODB_ANALYTICS_MAX_POOL_SIZE: Joi.number().integer().min(1).max(100).default(10),
  MONGODB_ANALYTICS_MAX_STALENESS_SECONDS: Joi.number().integer().min(0).max(300).default(90),
  REDIS_URL: Joi.string().required(),
  /**
   * `cluster` = ioredis **Cluster** (ElastiCache **cluster mode** or self-managed 7+).
   * `standard` = single `Redis` (local dev, single node).
   */
  REDIS_MODE: Joi.string().valid("standard", "cluster").default("standard"),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  /** Bearer token for `GET /admin/queues` (Bull Board). If unset, the UI is not mounted. */
  QUEUE_ADMIN_TOKEN: Joi.string().optional().allow(""),
  /**
   * Bearer token for **Organization** hierarchy APIs (`/api/organizations`).
   * Platform-admin only; align with Vault / GitHub Actions secret in prod.
   */
  PLATFORM_ADMIN_TOKEN: Joi.string().optional().allow(""),
  QUEUE_METRICS_INTERVAL_MS: Joi.number().integer().min(1000).default(10_000),
  /**
   * express-session HMAC; must match `connect-redis` and production cookie signing.
   */
  SESSION_SECRET: Joi.string().min(32).required(),
  /**
   * When `true`, set `Set-Cookie` with `Secure`. Use `true` in **staging** / **production** (HTTPS or TLS to client).
   * Default `false` so **local** `http://` dev receives the cookie; override in deployed envs.
   */
  SESSION_COOKIE_SECURE: Joi.boolean().default(false),
  /**
   * CSRF / cross-site policy for the session cookie. `strict` for prod API browsers;
   * use `lax` in dev if needed for local tooling.
   */
  SESSION_COOKIE_SAMESITE: Joi.string()
    .valid("strict", "lax", "none")
    .default("strict"),
  /**
   * Sliding-window rate limit (Redis ZSETs). If Redis is down, the limiter **fails open** (no 429 from limiter).
   */
  RATE_LIMIT_ENABLED: Joi.boolean().default(true),
  RATE_LIMIT_TENANT_WINDOW_SEC: Joi.number().integer().min(1).max(3600).default(60),
  RATE_LIMIT_TENANT_MAX: Joi.number().integer().min(1).default(1000),
  RATE_LIMIT_USER_WINDOW_SEC: Joi.number().integer().min(1).max(3600).default(60),
  RATE_LIMIT_USER_MAX: Joi.number().integer().min(1).default(100),
  RATE_LIMIT_ENDPOINT_WINDOW_SEC: Joi.number().integer().min(1).max(3600).default(60),
  RATE_LIMIT_ENDPOINT_MAX: Joi.number().integer().min(1).default(50),
  /**
   * GET **JSON** response **cache-aside** (Redis). See `cache.middleware.ts` for path → TTL table.
   */
  RESPONSE_CACHE_ENABLED: Joi.boolean().default(true),
  /**
   * Redis **PUBSUB** for per-org events (envelope + `Publisher`). Subscriber uses a duplicate connection.
   */
  PUBSUB_ENABLED: Joi.boolean().default(true),
  /** **Socket.io** on the same HTTP **Server**; bridges Redis messages to `org:{id}` rooms. */
  WEBSOCKET_ENABLED: Joi.boolean().default(true),
}).unknown();

const { error, value: envVars } = envSchema.validate(process.env, {
  abortEarly: false,
});

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

if (envVars.MONGODB_MIN_POOL_SIZE > envVars.MONGODB_MAX_POOL_SIZE) {
  throw new Error(
    "Config: MONGODB_MIN_POOL_SIZE must be <= MONGODB_MAX_POOL_SIZE",
  );
}
if (envVars.MONGODB_ANALYTICS_URI && envVars.MONGODB_URI === envVars.MONGODB_ANALYTICS_URI) {
  throw new Error(
    "Config: MONGODB_ANALYTICS_URI should use a read-only user (different from MONGODB_URI); same URI is not allowed",
  );
}
if (
  envVars.MONGODB_ANALYTICS_URI &&
  envVars.MONGODB_ANALYTICS_MIN_POOL_SIZE > envVars.MONGODB_ANALYTICS_MAX_POOL_SIZE
) {
  throw new Error(
    "Config: MONGODB_ANALYTICS_MIN_POOL_SIZE must be <= MONGODB_ANALYTICS_MAX_POOL_SIZE",
  );
}
if (envVars.TIMESCALE_POOL_MIN > envVars.TIMESCALE_POOL_MAX) {
  throw new Error(
    "Config: TIMESCALE_POOL_MIN must be <= TIMESCALE_POOL_MAX",
  );
}

/** Parsed from `REDIS_URL` for BullMQ / ioredis-style options. */
function parseRedisUrl(redisUrl: string): {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
} {
  const u = new URL(redisUrl);
  if (u.protocol !== "redis:" && u.protocol !== "rediss:") {
    throw new Error("REDIS_URL must use redis:// or rediss://");
  }
  const port = u.port ? Number(u.port) : u.protocol === "rediss:" ? 6380 : 6379;
  return {
    host: u.hostname,
    port,
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    ...(u.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

const redisConnection = parseRedisUrl(envVars.REDIS_URL);

export const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  mongodb: {
    uri: envVars.MONGODB_URI,
    minPoolSize: envVars.MONGODB_MIN_POOL_SIZE,
    maxPoolSize: envVars.MONGODB_MAX_POOL_SIZE,
    analytics:
      envVars.MONGODB_ANALYTICS_URI && envVars.MONGODB_ANALYTICS_URI.length > 0
        ? {
            uri: envVars.MONGODB_ANALYTICS_URI,
            minPoolSize: envVars.MONGODB_ANALYTICS_MIN_POOL_SIZE,
            maxPoolSize: envVars.MONGODB_ANALYTICS_MAX_POOL_SIZE,
            maxStalenessSeconds: envVars.MONGODB_ANALYTICS_MAX_STALENESS_SECONDS,
          }
        : null,
  },
  timescale:
    envVars.TIMESCALE_DATABASE_URL && envVars.TIMESCALE_DATABASE_URL.length > 0
      ? {
          connectionString: envVars.TIMESCALE_DATABASE_URL,
          minPoolSize: envVars.TIMESCALE_POOL_MIN,
          maxPoolSize: envVars.TIMESCALE_POOL_MAX,
        }
      : null,
  opensearch:
    envVars.OPENSEARCH_NODE && envVars.OPENSEARCH_NODE.trim().length > 0
      ? {
          node: envVars.OPENSEARCH_NODE.trim(),
          username:
            envVars.OPENSEARCH_USERNAME && envVars.OPENSEARCH_USERNAME.length > 0
              ? envVars.OPENSEARCH_USERNAME
              : undefined,
          password:
            envVars.OPENSEARCH_PASSWORD && envVars.OPENSEARCH_PASSWORD.length > 0
              ? envVars.OPENSEARCH_PASSWORD
              : undefined,
        }
      : null,
  s3:
    envVars.S3_FILES_BUCKET && envVars.S3_FILES_BUCKET.trim().length > 0
      ? {
          bucket: envVars.S3_FILES_BUCKET.trim(),
          region: envVars.S3_FILES_REGION.trim() || "us-east-1",
          kmsKeyArn:
            envVars.S3_FILES_KMS_KEY_ARN && envVars.S3_FILES_KMS_KEY_ARN.length > 0
              ? envVars.S3_FILES_KMS_KEY_ARN
              : undefined,
        }
      : null,
  redis: {
    url: envVars.REDIS_URL,
    mode: envVars.REDIS_MODE,
    host: redisConnection.host,
    port: redisConnection.port,
    connection: redisConnection,
  },
  jwt: {
    accessSecret: envVars.JWT_ACCESS_SECRET,
    refreshSecret: envVars.JWT_REFRESH_SECRET,
  },
  queueMonitoring: {
    adminToken:
      envVars.QUEUE_ADMIN_TOKEN && envVars.QUEUE_ADMIN_TOKEN.length > 0
        ? envVars.QUEUE_ADMIN_TOKEN
        : null,
    metricsIntervalMs: envVars.QUEUE_METRICS_INTERVAL_MS,
  },
  hierarchy: {
    platformAdminToken:
      envVars.PLATFORM_ADMIN_TOKEN && envVars.PLATFORM_ADMIN_TOKEN.length > 0
        ? envVars.PLATFORM_ADMIN_TOKEN
        : null,
  },
  /**
   * express-session + `connect-redis` (24h store TTL, aligned with cookie `maxAge`).
   * `SESSION_COOKIE_SECURE` defaults `false` for local HTTP; set `true` in staging/prod (see `.env.example`).
   */
  session: {
    secret: envVars.SESSION_SECRET,
    name: "1cmd_session" as const,
    /** `connect-redis` / `express-session` key prefix; keep in sync with `session-key-enumeration` */
    redisKeyPrefix: "sess:" as const,
    maxAgeMs: 24 * 60 * 60 * 1000,
    storeTtlSeconds: 24 * 60 * 60,
    cookie: {
      secure: envVars.SESSION_COOKIE_SECURE,
      sameSite: envVars.SESSION_COOKIE_SAMESITE,
    },
  },
  /**
   * **Sliding window** (per request: tenant + user + endpoint), see `rate-limiter.middleware.ts`.
   */
  rateLimit: {
    enabled: envVars.RATE_LIMIT_ENABLED,
    tenantWindowSec: envVars.RATE_LIMIT_TENANT_WINDOW_SEC,
    tenantMax: envVars.RATE_LIMIT_TENANT_MAX,
    userWindowSec: envVars.RATE_LIMIT_USER_WINDOW_SEC,
    userMax: envVars.RATE_LIMIT_USER_MAX,
    endpointWindowSec: envVars.RATE_LIMIT_ENDPOINT_WINDOW_SEC,
    endpointMax: envVars.RATE_LIMIT_ENDPOINT_MAX,
  },
  responseCache: {
    enabled: envVars.RESPONSE_CACHE_ENABLED,
  },
  pubsub: {
    enabled: envVars.PUBSUB_ENABLED,
    websocketEnabled: envVars.WEBSOCKET_ENABLED,
  },
} as const;

export type AppConfig = typeof config;
