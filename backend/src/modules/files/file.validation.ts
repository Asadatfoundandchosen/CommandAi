import { z } from "zod";

import { MAX_UPLOAD_BYTES } from "./file.constants.js";

export const presignUploadBodySchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(128),
  contentLengthBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_UPLOAD_BYTES),
});

export const presignDownloadBodySchema = z.object({
  key: z.string().min(1).max(1024),
});
