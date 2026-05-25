/** Minimal env for unit tests that import `@config/index` (no committed `.env` required). */
const defaults: Record<string, string> = {
  NODE_ENV: "development",
  MONGODB_URI: "mongodb://127.0.0.1:27017/1commandai_test",
  REDIS_URL: "redis://127.0.0.1:6379",
  JWT_ACCESS_SECRET: "change-me-access-secret-min-32-chars!!",
  JWT_REFRESH_SECRET: "change-me-refresh-secret-min-32-chars!",
  SESSION_SECRET: "change-me-session-secret-min-32-chars!!",
  MFA_ENCRYPTION_KEY: "change-me-mfa-encryption-key-32b!!",
  FIELD_ENCRYPTION_KEY:
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}
