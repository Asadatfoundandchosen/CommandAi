import type { Container } from "inversify";
import { Router } from "express";

import { FilesController } from "./file.controller.js";

/**
 * @openapi
 * /files/presign-upload:
 *   post:
 *     summary: Presigned S3 PUT URL (15m TTL, content-type whitelist, max 100MB)
 *     tags: [Files]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [filename, contentType, contentLengthBytes]
 *             properties:
 *               filename: { type: string }
 *               contentType: { type: string }
 *               contentLengthBytes: { type: integer }
 *     responses:
 *       200:
 *         description: url and key
 * /files/presign-download:
 *   post:
 *     summary: Presigned S3 GET URL (15m TTL)
 *     tags: [Files]
 */
export function createFilesRouter(container: Container): Router {
  const controller = container.get<FilesController>(FilesController);
  const router = Router();
  router.post("/presign-upload", (req, res) => controller.presignUpload(req, res));
  router.post("/presign-download", (req, res) =>
    controller.presignDownload(req, res),
  );
  return router;
}
