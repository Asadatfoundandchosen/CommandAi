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
    const s3c = config.s3;
    if (!s3c) {
      throw new FileServiceError(
        "S3 is not configured (S3_FILES_BUCKET / S3_FILES_REGION)",
        "not_configured",
      );
    }
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
   * **Presigned GET** for direct client download. **Key** must be under **`uploads/<orgId>/`** or **`audit-exports/<orgId>/`** (matches S3 lifecycle prefixes).
   */
  async getDownloadUrl(orgId: string, key: string): Promise<{ url: string }> {
    const s3c = config.s3;
    if (!s3c) {
      throw new FileServiceError(
        "S3 is not configured (S3_FILES_BUCKET / S3_FILES_REGION)",
        "not_configured",
      );
    }
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
