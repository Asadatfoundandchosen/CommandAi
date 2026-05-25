import type { Container } from "inversify";
import { Router } from "express";

import { createRequirePermission } from "@common/middleware/permission.middleware.js";
import {
  validateZodBody,
  validateZodParams,
  validateZodQuery,
} from "@common/middleware/validation.middleware.js";

import { ApiKeyController } from "./api-key.controller.js";
import {
  apiKeyIdParamsSchema,
  createApiKeyBodySchema,
  listApiKeysQuerySchema,
  updateApiKeyBodySchema,
} from "./api-key.validation.js";

/**
 * @openapi
 * tags:
 *   - name: API Keys
 *     description: |
 *       Org-scoped API keys for machine-to-machine authentication.
 *       Full secret returned only on create and rotate.
 *
 * /v1/api-keys:
 *   get:
 *     tags: [API Keys]
 *     summary: List API keys (prefix only, never full secret)
 *     security:
 *       - bearerAuth: []
 *   post:
 *     tags: [API Keys]
 *     summary: Create API key (returns secret once)
 *     security:
 *       - bearerAuth: []
 *
 * /v1/api-keys/{id}:
 *   get:
 *     tags: [API Keys]
 *     summary: Get API key metadata
 *     security:
 *       - bearerAuth: []
 *   patch:
 *     tags: [API Keys]
 *     summary: Update API key metadata or permissions
 *     security:
 *       - bearerAuth: []
 *   delete:
 *     tags: [API Keys]
 *     summary: Revoke API key
 *     security:
 *       - bearerAuth: []
 *
 * /v1/api-keys/{id}/rotate:
 *   post:
 *     tags: [API Keys]
 *     summary: Rotate API key (returns new secret once)
 *     security:
 *       - bearerAuth: []
 */
export function createApiKeysRouter(container: Container): Router {
  const controller = container.get(ApiKeyController);
  const router = Router();
  const manageKeys = createRequirePermission("users:update:organization");

  router.get("/", validateZodQuery(listApiKeysQuerySchema), (req, res) =>
    controller.list(req, res),
  );
  router.post("/", manageKeys, validateZodBody(createApiKeyBodySchema), (req, res) =>
    controller.create(req, res),
  );
  router.get("/:id", validateZodParams(apiKeyIdParamsSchema), (req, res) =>
    controller.getById(req, res),
  );
  router.patch(
    "/:id",
    manageKeys,
    validateZodParams(apiKeyIdParamsSchema),
    validateZodBody(updateApiKeyBodySchema),
    (req, res) => controller.update(req, res),
  );
  router.delete("/:id", manageKeys, validateZodParams(apiKeyIdParamsSchema), (req, res) =>
    controller.revoke(req, res),
  );
  router.post("/:id/rotate", manageKeys, validateZodParams(apiKeyIdParamsSchema), (req, res) =>
    controller.rotate(req, res),
  );

  return router;
}
