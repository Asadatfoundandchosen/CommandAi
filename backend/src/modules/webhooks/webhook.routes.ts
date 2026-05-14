import type { Container } from "inversify";
import { Router } from "express";

import { WebhooksController } from "./webhook.controller.js";

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
  router.post("/", (req, res) => controller.create(req, res));
  router.delete("/:id", (req, res) => controller.remove(req, res));
  router.get("/deliveries", (req, res) => controller.deliveries(req, res));
  router.post("/dispatch", (req, res) => controller.broadcast(req, res));
  router.post("/:id/deliver", (req, res) => controller.deliver(req, res));
  return router;
}
