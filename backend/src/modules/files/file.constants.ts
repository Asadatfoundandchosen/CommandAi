/** Presigned URL TTL (seconds) — **15 minutes**. */
export const PRESIGNED_URL_EXPIRES_SEC = 900;

/** Max upload size for presigned **PutObject** (bytes) — **100 MiB**. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * Allowed **Content-Type** values for uploads (strict whitelist).
 * Extend intentionally when new document types are supported.
 */
export const ALLOWED_UPLOAD_CONTENT_TYPES = new Set<string>([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/json",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
