import { createHash } from "node:crypto";

import dotenv from "dotenv";
import Joi from "joi";

import {
  assertOpenSearchHttps,
  assertRedisUrlTls,
  normalizeTimescaleConnectionString,
} from "./tls-policy.js";

dotenv.config();

const envSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid("development", "staging", "production")
    .required(),
  PORT: Joi.number().default(3000),
  /** Public app URL for magic-link emails (SPA / frontend origin). */
  APP_URL: Joi.string().uri().default("http://localhost:5173"),
  /** Public API base URL for SAML ACS/entity IDs (defaults to http://localhost:{PORT}). */
  API_PUBLIC_URL: Joi.string().uri().allow("").default(""),
  /** Platform-default SP certificate (PEM) when org has no per-tenant cert. */
  SAML_SP_CERTIFICATE: Joi.string().allow("").default(""),
  /** Platform-default SP private key (PEM); use Vault in prod. */
  SAML_SP_PRIVATE_KEY: Joi.string().allow("").default(""),
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
  /** HSTS `max-age` in seconds (API responses). Default 365 days. */
  HSTS_MAX_AGE_SECONDS: Joi.number().integer().min(0).default(31_536_000),
  /** Redirect cleartext HTTP to HTTPS at the app layer (ALB also redirects). Default on in staging/prod. */
  FORCE_HTTPS_REDIRECT: Joi.boolean().default(false),
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
  RATE_LIMIT_ENDPOINT_MAX: Joi.number().integer().min(1).default(100),
  RATE_LIMIT_EXPENSIVE_MAX: Joi.number().integer().min(1).default(10),
  /** Maximum configurable audit log retention per org (days). Minimum enforced at 365 in app logic. */
  AUDIT_RETENTION_MAX_DAYS: Joi.number().integer().min(365).default(3650),
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
  /** Stripe secret key (empty = billing integration disabled). */
  STRIPE_SECRET_KEY: Joi.string().allow("").default(""),
  /** Stripe publishable key for Elements (`pk_test_…` / `pk_live_…`). */
  STRIPE_PUBLISHABLE_KEY: Joi.string().allow("").default(""),
  /** Stripe webhook signing secret (`whsec_…`). */
  STRIPE_WEBHOOK_SECRET: Joi.string().allow("").default(""),
  /** SendGrid API key for transactional email (optional). */
  SENDGRID_API_KEY: Joi.string().allow("").default(""),
  /** From address for SendGrid (optional). */
  SENDGRID_FROM_EMAIL: Joi.string().allow("").default(""),
  /**
   * Max concurrent auth sessions per user (Redis). `0` = unlimited.
   * Oldest sessions (by `last_active`) are revoked when the limit is exceeded.
   */
  AUTH_MAX_CONCURRENT_SESSIONS: Joi.number().integer().min(0).max(100).default(10),
  /**
   * Optional cookie `Domain` (e.g. `.1command.ai`). Empty = host-only (default).
   */
  COOKIE_DOMAIN: Joi.string().allow("").default(""),
  /**
   * Store refresh JWT in httpOnly cookie (recommended for browser SPAs).
   */
  AUTH_REFRESH_IN_COOKIE: Joi.boolean().default(true),
  /**
   * Also return `refreshToken` in JSON login/refresh responses (legacy / mobile clients).
   */
  AUTH_REFRESH_IN_RESPONSE_BODY: Joi.boolean().default(true),
  /**
   * Enforce double-submit CSRF when auth cookies are present on mutations.
   */
  CSRF_PROTECTION_ENABLED: Joi.boolean().default(true),
  /**
   * AES-256-GCM master key for field-level encryption — **64 hex chars** (32 bytes). Vault in prod.
   * When unset in dev/test, derived from `MFA_ENCRYPTION_KEY`.
   */
  FIELD_ENCRYPTION_KEY: Joi.string().length(64).hex().optional(),
  /**
   * Legacy UTF-8 key for decrypting `v1:` ciphertext (TOTP / SSO written before FIELD_ENCRYPTION_KEY).
   */
  MFA_ENCRYPTION_KEY: Joi.string().min(32).required(),
  /** Twilio SMS MFA (all three required when enabling SMS). */
  TWILIO_ACCOUNT_SID: Joi.string().allow("").default(""),
  TWILIO_AUTH_TOKEN: Joi.string().allow("").default(""),
  TWILIO_FROM_NUMBER: Joi.string().allow("").default(""),
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

assertRedisUrlTls(envVars.NODE_ENV, envVars.REDIS_URL);

if (envVars.TIMESCALE_DATABASE_URL && envVars.TIMESCALE_DATABASE_URL.length > 0) {
  envVars.TIMESCALE_DATABASE_URL = normalizeTimescaleConnectionString(
    envVars.NODE_ENV,
    envVars.TIMESCALE_DATABASE_URL,
  );
}

assertOpenSearchHttps(envVars.NODE_ENV, envVars.OPENSEARCH_NODE);

if (
  (envVars.NODE_ENV === "production" || envVars.NODE_ENV === "staging") &&
  !envVars.SESSION_COOKIE_SECURE
) {
  throw new Error(
    "Config: SESSION_COOKIE_SECURE must be true in staging/production (HTTPS only)",
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

const fieldEncryptionKeyHex =
  envVars.FIELD_ENCRYPTION_KEY ??
  createHash("sha256").update(envVars.MFA_ENCRYPTION_KEY, "utf8").digest("hex");

if (
  (envVars.NODE_ENV === "production" || envVars.NODE_ENV === "staging") &&
  !envVars.FIELD_ENCRYPTION_KEY
) {
  throw new Error(
    "Config: FIELD_ENCRYPTION_KEY (64 hex chars) is required in staging/production",
  );
}

const fieldEncryptionSearchKey = Buffer.from(fieldEncryptionKeyHex, "hex");

const apiPublicUrl =
  envVars.API_PUBLIC_URL && envVars.API_PUBLIC_URL.length > 0
    ? envVars.API_PUBLIC_URL.replace(/\/$/, "")
    : `http://localhost:${envVars.PORT}`;

export const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  appUrl: envVars.APP_URL,
  apiPublicUrl,
  saml:
    envVars.SAML_SP_CERTIFICATE &&
    envVars.SAML_SP_CERTIFICATE.length > 0 &&
    envVars.SAML_SP_PRIVATE_KEY &&
    envVars.SAML_SP_PRIVATE_KEY.length > 0
      ? {
          spCertificate: envVars.SAML_SP_CERTIFICATE,
          spPrivateKey: envVars.SAML_SP_PRIVATE_KEY,
        }
      : null,
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
  tls: {
    hstsMaxAgeSeconds: envVars.HSTS_MAX_AGE_SECONDS,
    forceHttpsRedirect:
      envVars.FORCE_HTTPS_REDIRECT ||
      envVars.NODE_ENV === "production" ||
      envVars.NODE_ENV === "staging",
  },
  authSessions: {
    maxConcurrent: envVars.AUTH_MAX_CONCURRENT_SESSIONS,
  },
  cookies: {
    domain:
      envVars.COOKIE_DOMAIN && envVars.COOKIE_DOMAIN.length > 0
        ? envVars.COOKIE_DOMAIN
        : undefined,
    path: "/" as const,
    secure: envVars.SESSION_COOKIE_SECURE,
    sameSite: envVars.SESSION_COOKIE_SAMESITE,
    refreshTokenName: "refresh_token" as const,
    csrfTokenName: "1cmd_csrf" as const,
    refreshInCookie: envVars.AUTH_REFRESH_IN_COOKIE,
    refreshInResponseBody: envVars.AUTH_REFRESH_IN_RESPONSE_BODY,
    sessionMaxAgeMs: 24 * 60 * 60 * 1000,
  },
  csrf: {
    enabled: envVars.CSRF_PROTECTION_ENABLED,
  },
  mfa: {
    encryptionKey: envVars.MFA_ENCRYPTION_KEY,
  },
  encryption: {
    key: fieldEncryptionKeyHex,
    legacyKey: envVars.MFA_ENCRYPTION_KEY,
    searchKey: fieldEncryptionSearchKey,
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
      path: "/" as const,
      domain:
        envVars.COOKIE_DOMAIN && envVars.COOKIE_DOMAIN.length > 0
          ? envVars.COOKIE_DOMAIN
          : undefined,
      httpOnly: true as const,
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
    expensiveMax: envVars.RATE_LIMIT_EXPENSIVE_MAX,
  },
  responseCache: {
    enabled: envVars.RESPONSE_CACHE_ENABLED,
  },
  pubsub: {
    enabled: envVars.PUBSUB_ENABLED,
    websocketEnabled: envVars.WEBSOCKET_ENABLED,
  },
  stripe:
    envVars.STRIPE_SECRET_KEY && envVars.STRIPE_SECRET_KEY.length > 0
      ? {
          secretKey: envVars.STRIPE_SECRET_KEY,
          publishableKey:
            envVars.STRIPE_PUBLISHABLE_KEY && envVars.STRIPE_PUBLISHABLE_KEY.length > 0
              ? envVars.STRIPE_PUBLISHABLE_KEY
              : null,
          webhookSecret:
            envVars.STRIPE_WEBHOOK_SECRET && envVars.STRIPE_WEBHOOK_SECRET.length > 0
              ? envVars.STRIPE_WEBHOOK_SECRET
              : null,
        }
      : null,
  sendgrid:
    envVars.SENDGRID_API_KEY && envVars.SENDGRID_API_KEY.length > 0
      ? {
          apiKey: envVars.SENDGRID_API_KEY,
          fromEmail:
            envVars.SENDGRID_FROM_EMAIL && envVars.SENDGRID_FROM_EMAIL.length > 0
              ? envVars.SENDGRID_FROM_EMAIL
              : null,
        }
      : null,
  twilio:
    envVars.TWILIO_ACCOUNT_SID &&
    envVars.TWILIO_ACCOUNT_SID.length > 0 &&
    envVars.TWILIO_AUTH_TOKEN &&
    envVars.TWILIO_AUTH_TOKEN.length > 0 &&
    envVars.TWILIO_FROM_NUMBER &&
    envVars.TWILIO_FROM_NUMBER.length > 0
      ? {
          accountSid: envVars.TWILIO_ACCOUNT_SID,
          authToken: envVars.TWILIO_AUTH_TOKEN,
          fromNumber: envVars.TWILIO_FROM_NUMBER,
        }
      : null,
  /** Per-org audit log retention caps (see `modules/retention`). */
  retention: {
    maxAuditDays: envVars.AUDIT_RETENTION_MAX_DAYS,
  },
} as const;

export type AppConfig = typeof config;
