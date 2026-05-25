/**
 * TLS / encryption-in-transit policy for database URLs and public endpoints.
 * Staging/production: no plaintext Redis; MongoDB TLS; PostgreSQL sslmode=require; HTTPS OpenSearch.
 */

const DEPLOYED_ENVS = new Set(["staging", "production"]);

export function isDeployedEnv(env: string): boolean {
  return DEPLOYED_ENVS.has(env);
}

/** MongoDB driver TLS (Atlas `mongodb+srv` is TLS by default; enforce explicitly in deployed envs). */
export function mongooseTlsOptions(env: string, uri: string): { tls?: boolean } {
  if (!isDeployedEnv(env)) {
    return {};
  }
  if (uri.startsWith("mongodb://127.0.0.1") || uri.startsWith("mongodb://localhost")) {
    return {};
  }
  return { tls: true };
}

/** Require `rediss://` outside local development. */
export function assertRedisUrlTls(env: string, redisUrl: string): void {
  if (!isDeployedEnv(env)) {
    return;
  }
  if (!redisUrl.startsWith("rediss://")) {
    throw new Error(
      "Config: REDIS_URL must use rediss:// (TLS) in staging/production",
    );
  }
}

const STRONG_PG_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);

/** Ensure Timescale/PostgreSQL connection string requires SSL. */
export function normalizeTimescaleConnectionString(
  env: string,
  connectionString: string,
): string {
  if (!connectionString.trim()) {
    return connectionString;
  }
  const u = new URL(connectionString);
  const mode = u.searchParams.get("sslmode");
  if (isDeployedEnv(env)) {
    if (!mode || !STRONG_PG_SSL_MODES.has(mode)) {
      throw new Error(
        "Config: TIMESCALE_DATABASE_URL must include sslmode=require (or verify-ca / verify-full) in staging/production",
      );
    }
  } else if (!mode) {
    u.searchParams.set("sslmode", "prefer");
    return u.toString();
  }
  return connectionString;
}

/** OpenSearch node must be HTTPS in deployed environments. */
export function assertOpenSearchHttps(env: string, node: string): void {
  if (!isDeployedEnv(env) || !node.trim()) {
    return;
  }
  const normalized = node.trim().startsWith("http")
    ? node.trim()
    : `https://${node.trim()}`;
  if (normalized.startsWith("http://")) {
    throw new Error(
      "Config: OPENSEARCH_NODE must use https:// in staging/production",
    );
  }
}

/** `pg` pool SSL options (RDS). */
export function pgSslOptions(env: string): { rejectUnauthorized: boolean } | false {
  return isDeployedEnv(env) ? { rejectUnauthorized: true } : false;
}
