import type { Container } from "inversify";
import { Router } from "express";

import {
  validateZodBody,
  validateZodParams,
  validateZodQuery,
} from "@common/middleware/validation.middleware.js";

import { WebhooksController } from "./webhook.controller.js";
import {
  broadcastEventBodySchema,
  createWebhookBodySchema,
  listDeliveriesQuerySchema,
  webhookIdParamSchema,
} from "./webhook.validation.js";

/**
 * @openapi
 * tags:
 *   - name: Webhooks
 *     description: Outbound webhooks and delivery log (org-scoped; use org_id or x-org-id)
 */
export function createWebhooksRouter(container: Container): Router {
  const controller = container.get(WebhooksController);
  const router = Router();
  router.get("/", (req, res) => controller.list(req, res));
  router.post("/", validateZodBody(createWebhookBodySchema), (req, res) =>
    controller.create(req, res),
  );
  router.delete("/:id", validateZodParams(webhookIdParamSchema), (req, res) =>
    controller.remove(req, res),
  );
  router.get("/deliveries", validateZodQuery(listDeliveriesQuerySchema), (req, res) =>
    controller.deliveries(req, res),
  );
  router.post("/dispatch", validateZodBody(broadcastEventBodySchema), (req, res) =>
    controller.broadcast(req, res),
  );
  router.post("/:id/deliver", validateZodParams(webhookIdParamSchema), (req, res) =>
    controller.deliver(req, res),
  );
  return router;
}
