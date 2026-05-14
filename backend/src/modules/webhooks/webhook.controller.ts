import { randomBytes } from "node:crypto";
import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { TYPES } from "../../types.js";
import { requestCacheInvalidation } from "../../infrastructure/cache/invalidation.js";
import { WebhookService } from "./webhook.service.js";
import {
  broadcastEventBodySchema,
  createWebhookBodySchema,
  listDeliveriesQuerySchema,
  webhookIdParamSchema,
} from "./webhook.validation.js";

@injectable()
export class WebhooksController {
  constructor(
    @inject(TYPES.WebhookService) private readonly webhooks: WebhookService,
  ) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const orgId = String(req.query.org_id ?? "");
    if (!orgId) {
      res.status(400).json({ error: "org_id is required" });
      return;
    }
    const data = await this.webhooks.listWebhooks(orgId);
    res.status(200).json({ data });
  };

  create = async (req: Request, res: Response): Promise<void> => {
    const parsed = createWebhookBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const orgId = String(req.query.org_id ?? req.headers["x-org-id"] ?? "");
    if (!orgId) {
      res.status(400).json({ error: "org_id required (query org_id or header x-org-id)" });
      return;
    }
    const body = parsed.data;
    const secret = body.secret ?? randomBytes(24).toString("base64url");
    const w = await this.webhooks.register(orgId, {
      name: body.name,
      url: body.url,
      secret,
      isActive: body.isActive,
    });
    requestCacheInvalidation({ orgId, resource: "webhooks" });
    res.status(201).json({ data: w });
  };

  remove = async (req: Request, res: Response): Promise<void> => {
    const p = webhookIdParamSchema.safeParse(req.params);
    if (!p.success) {
      res.status(400).json({ error: p.error.flatten() });
      return;
    }
    const orgId = String(req.query.org_id ?? req.headers["x-org-id"] ?? "");
    if (!orgId) {
      res.status(400).json({ error: "org_id required" });
      return;
    }
    const ok = await this.webhooks.remove(p.data.id, orgId);
    if (!ok) {
      res.status(404).json({ error: "not found" });
      return;
    }
    requestCacheInvalidation({ orgId, resource: "webhooks", id: p.data.id });
    res.status(204).send();
  };

  /**
   * Delivery status dashboard: recent delivery attempts (in-memory in dev; persist in production).
   */
  deliveries = async (req: Request, res: Response): Promise<void> => {
    const q = listDeliveriesQuerySchema.safeParse(req.query);
    if (!q.success) {
      res.status(400).json({ error: q.error.flatten() });
      return;
    }
    const orgId =
      q.data.org_id ?? String(req.headers["x-org-id"] ?? "");
    if (!orgId) {
      res
        .status(400)
        .json({ error: "org_id (query) or x-org-id header is required" });
      return;
    }
    const { limit, webhook_id: webhookId } = q.data;
    const data = this.webhooks.getDeliveryLog(orgId, { limit, webhookId });
    res.status(200).json({ data });
  };

  /**
   * Fan-out a JSON event to all active org webhooks.
   */
  broadcast = async (req: Request, res: Response): Promise<void> => {
    const b = broadcastEventBodySchema.safeParse(req.body);
    if (!b.success) {
      res.status(400).json({ error: b.error.flatten() });
      return;
    }
    const orgId = String(req.query.org_id ?? req.headers["x-org-id"] ?? "");
    if (!orgId) {
      res.status(400).json({ error: "org_id required" });
      return;
    }
    await this.webhooks.broadcastEvent(orgId, b.data.event);
    requestCacheInvalidation({ orgId, resource: "webhooks" });
    res.status(202).json({ ok: true });
  };

  /**
   * Queue a one-off delivery for testing or ops.
   */
  deliver = async (req: Request, res: Response): Promise<void> => {
    const p = webhookIdParamSchema.safeParse({ id: req.params.id });
    if (!p.success) {
      res.status(400).json({ error: p.error.flatten() });
      return;
    }
    const b = broadcastEventBodySchema.safeParse(req.body);
    if (!b.success) {
      res.status(400).json({ error: b.error.flatten() });
      return;
    }
    const orgId = String(req.query.org_id ?? req.headers["x-org-id"] ?? "");
    if (!orgId) {
      res.status(400).json({ error: "org_id required" });
      return;
    }
    const result = await this.webhooks.enqueueDelivery(
      orgId,
      p.data.id,
      b.data.event,
    );
    requestCacheInvalidation({ orgId, resource: "webhooks", id: p.data.id });
    res.status(202).json({ ok: true, jobId: result.jobId });
  };
}
