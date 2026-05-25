import { randomUUID } from "node:crypto";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { inject, injectable } from "inversify";

import { config } from "@config/index.js";
import { getS3Client } from "../../infrastructure/storage/s3-client.js";
import { AuditService } from "../audit/audit.service.js";
import { TYPES } from "../../types.js";
import { PRESIGNED_URL_EXPIRES_SEC } from "./file.constants.js";
import { FileServiceError } from "./file.errors.js";
import {
  assertKeyBelongsToOrg,
  sanitizeFilename,
  validateContentType,
  validateUploadSizeBytes,
} from "./file.presign-rules.js";

export { FileServiceError } from "./file.errors.js";
export {
  sanitizeFilename,
  validateContentType,
  validateUploadSizeBytes,
} from "./file.presign-rules.js";

@injectable()
export class FileService {
  constructor(@inject(TYPES.AuditService) private readonly audit: AuditService) {}

  /** Throws when S3 files bucket is not configured. */
  assertS3Configured(): void {
    if (!config.s3) {
      throw new FileServiceError(
        "S3 is not configured (S3_FILES_BUCKET / S3_FILES_REGION)",
        "not_configured",
      );
    }
  }

  /**
   * **Presigned PUT** for direct client upload. URL expires in **15 minutes**.
   * **Content-Type** must match whitelist; declared size must be **≤ 100MB** (enforced in signature via `ContentLength`).
   */
  async getUploadUrl(
    orgId: string,
    filename: string,
    contentType: string,
    contentLengthBytes: number,
  ): Promise<{ url: string; key: string }> {
    this.assertS3Configured();
    const s3c = config.s3!;
    validateContentType(contentType);
    validateUploadSizeBytes(contentLengthBytes);
    const safeName = sanitizeFilename(filename);
    const key = `uploads/${orgId}/${randomUUID()}/${safeName}`;

    const put = new PutObjectCommand({
      Bucket: s3c.bucket,
      Key: key,
      ContentType: contentType.trim(),
      ContentLength: contentLengthBytes,
      ...(s3c.kmsKeyArn !== undefined
        ? {
            ServerSideEncryption: "aws:kms" as const,
            SSEKMSKeyId: s3c.kmsKeyArn,
          }
        : {}),
    });

    const s3 = getS3Client();
    const url = await getSignedUrl(s3, put, {
      expiresIn: PRESIGNED_URL_EXPIRES_SEC,
    });

    await this.logFileAccess(orgId, "files.presigned_upload_url", key, {
      content_type: contentType,
      content_length_bytes: contentLengthBytes,
    });

    return { url, key };
  }

  /**
   * Server-side upload of an audit export under **`audit-exports/<orgId>/`**.
   * Returns the S3 object key for presigned download.
   */
  async uploadAuditExport(
    orgId: string,
    body: Buffer,
    extension: "csv" | "json",
    contentType: string,
  ): Promise<string> {
    this.assertS3Configured();
    validateContentType(contentType);
    validateUploadSizeBytes(body.length);

    const s3c = config.s3!;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `audit-exports/${orgId}/${randomUUID()}/audit-export-${stamp}.${extension}`;

    const put = new PutObjectCommand({
      Bucket: s3c.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.length,
      ...(s3c.kmsKeyArn !== undefined
        ? {
            ServerSideEncryption: "aws:kms" as const,
            SSEKMSKeyId: s3c.kmsKeyArn,
          }
        : {}),
    });

    const s3 = getS3Client();
    await s3.send(put);

    await this.logFileAccess(orgId, "files.audit_export_uploaded", key, {
      content_type: contentType,
      content_length_bytes: body.length,
    });

    return key;
  }

  /**
   * Archive expired audit logs to S3 under the org's **`audit-archives/<orgId>/`** prefix.
   * Uses **GLACIER** storage class; bucket lifecycle may transition further per IaC.
   */
  async uploadAuditArchive(
    orgId: string,
    body: Buffer,
    archiveLocationPrefix: string,
  ): Promise<string> {
    this.assertS3Configured();
    validateContentType("application/json");
    validateUploadSizeBytes(body.length);

    const prefix = archiveLocationPrefix.trim().replace(/\/+$/, "");
    const expected = `audit-archives/${orgId}`;
    if (!prefix.startsWith(expected)) {
      throw new FileServiceError(
        `archive location must start with ${expected}/`,
      );
    }

    const s3c = config.s3!;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const key = `${prefix}/${randomUUID()}/audit-archive-${stamp}.jsonl`;

    const put = new PutObjectCommand({
      Bucket: s3c.bucket,
      Key: key,
      Body: body,
      ContentType: "application/json",
      ContentLength: body.length,
      StorageClass: "GLACIER",
      ...(s3c.kmsKeyArn !== undefined
        ? {
            ServerSideEncryption: "aws:kms" as const,
            SSEKMSKeyId: s3c.kmsKeyArn,
          }
        : {}),
    });

    const s3 = getS3Client();
    await s3.send(put);

    await this.logFileAccess(orgId, "files.audit_archive_uploaded", key, {
      content_length_bytes: body.length,
      storage_class: "GLACIER",
    });

    return key;
  }

  /**
   * **Presigned GET** for direct client download. **Key** must be under **`uploads/<orgId>/`**, **`audit-exports/<orgId>/`**, or **`audit-archives/<orgId>/`**.
   */
  async getDownloadUrl(orgId: string, key: string): Promise<{ url: string }> {
    this.assertS3Configured();
    const s3c = config.s3!;
    assertKeyBelongsToOrg(orgId, key.trim());

    const get = new GetObjectCommand({
      Bucket: s3c.bucket,
      Key: key.trim(),
    });

    const s3 = getS3Client();
    const url = await getSignedUrl(s3, get, {
      expiresIn: PRESIGNED_URL_EXPIRES_SEC,
    });

    await this.logFileAccess(orgId, "files.presigned_download_url", key.trim(), {});

    return { url };
  }

  private async logFileAccess(
    orgId: string,
    action: string,
    key: string,
    extra: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.audit.indexAuditEvent(
        {
          org_id: orgId,
          action,
          resource: "s3_object",
          resource_id: key,
          changes: extra,
        },
        { id: `file-audit-${randomUUID()}` },
      );
    } catch (e) {
      process.stderr.write(`[files] audit log failed: ${String(e)}\n`);
    }
  }
}
