import { basename } from "node:path";

import { FileServiceError } from "./file.errors.js";
import {
  ALLOWED_UPLOAD_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
} from "./file.constants.js";

/** Strip path segments and unsafe characters; keep a safe object name segment. */
export function sanitizeFilename(filename: string): string {
  const base = basename(filename.trim()).replace(/[\x00-\x1f\x7f]/g, "");
  if (base.length === 0) {
    throw new FileServiceError("filename is empty after sanitization");
  }
  return base.length > 200 ? base.slice(0, 200) : base;
}

export function validateContentType(contentType: string): void {
  const ct = contentType.trim().toLowerCase();
  if (!ALLOWED_UPLOAD_CONTENT_TYPES.has(ct)) {
    throw new FileServiceError(
      `content type not allowed: ${contentType} (use whitelist from file.constants)`,
    );
  }
}

export function validateUploadSizeBytes(contentLengthBytes: number): void {
  if (!Number.isFinite(contentLengthBytes) || contentLengthBytes <= 0) {
    throw new FileServiceError("contentLengthBytes must be a positive number");
  }
  if (contentLengthBytes > MAX_UPLOAD_BYTES) {
    throw new FileServiceError(
      `upload exceeds max size (${MAX_UPLOAD_BYTES} bytes / 100MB)`,
    );
  }
}

export function assertKeyBelongsToOrg(orgId: string, key: string): void {
  const uploadPrefix = `uploads/${orgId}/`;
  const auditExportPrefix = `audit-exports/${orgId}/`;
  const auditArchivePrefix = `audit-archives/${orgId}/`;
  if (
    !key.startsWith(uploadPrefix) &&
    !key.startsWith(auditExportPrefix) &&
    !key.startsWith(auditArchivePrefix)
  ) {
    throw new FileServiceError("key does not belong to this organization");
  }
  if (key.includes("..") || key.startsWith("/")) {
    throw new FileServiceError("invalid key");
  }
}
