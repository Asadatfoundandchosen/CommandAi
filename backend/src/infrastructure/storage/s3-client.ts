import { S3Client } from "@aws-sdk/client-s3";

import { config } from "@config/index.js";

let client: S3Client | null = null;

/** Lazily built **S3** client (IAM role / env credentials in prod). */
export function getS3Client(): S3Client {
  if (!config.s3) {
    throw new Error("S3 is not configured (set S3_FILES_BUCKET and S3_FILES_REGION)");
  }
  if (!client) {
    client = new S3Client({ region: config.s3.region });
  }
  return client;
}
