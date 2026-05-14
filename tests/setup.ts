/**
 * Jest setup — runs before each test file (setupFilesAfterEnv).
 * Integration tests read `MONGODB_URI` (set in CI by the workflow + MongoDB service).
 */
process.env.TZ = "UTC";

const mongoUri = process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017";
process.env.MONGODB_URI = mongoUri;

if (process.env.JEST_INTEGRATION === "1") {
  jest.setTimeout(30_000);
} else {
  jest.setTimeout(10_000);
}
