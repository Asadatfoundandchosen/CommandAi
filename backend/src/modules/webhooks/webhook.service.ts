import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { inject, injectable } from "inversify";
import type { Job } from "bullmq";

import {
  type WebhookDeliveryJob,
  webhookDeliveryQueue,
} from "../../infrastructure/queue/queues/webhook-delivery.queue.js";
import { TYPES } from "../../types.js";
import type { Webhook, WebhookDeliveryLog } from "./webhook.model.js";
import { WebhookRepository } from "./webhook.repository.js";

const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_EVENT_SNIPPET = 4_096;
const HMAC_PREFIX = "sha256=";

function eventTypeName(event: unknown): string {
  if (
    event !== null &&
    typeof event === "object" &&
    "type" in event &&
    typeof (event as { type: unknown }).type === "string"
  ) {
    return (event as { type: string }).type;
  }
  return "unknown";
}

function snippetJson(event: unknown): string {
  try {
    const s = JSON.stringify(event);
    return s.length > MAX_EVENT_SNIPPET
      ? `${s.slice(0, MAX_EVENT_SNIPPET)}…`
      : s;
  } catch {
    return "[unserializable]";
  }
}

@injectable()
export class WebhookService {
  private static readonly maxJobAttempts = 3;

  constructor(
    @inject(TYPES.WebhookRepository) private readonly webhooks: WebhookRepository,
  ) {}

  /** HMAC-SHA256 hex, exposed for receiver verification: compare to `X-Webhook-Signature` after `sha256=` prefix. */
  signPayload(payload: string, secret: string): string {
    return createHmac("sha256", secret).update(payload).digest("hex");
  }

  /**
   * Verify `X-Webhook-Signature` for a raw JSON body (same bytes that were signed).
   * Header format: `sha256=<hex>` (case-sensitive hex).
   */
  verifySignature(rawBody: string, secret: string, signatureHeader: string): boolean {
    const raw = signatureHeader.startsWith(HMAC_PREFIX)
      ? signatureHeader.slice(HMAC_PREFIX.length)
      : signatureHeader;
    const expectedHex = this.signPayload(rawBody, secret);
    if (raw.length !== expectedHex.length) {
      return false;
    }
    try {
      return timingSafeEqual(Buffer.from(raw, "hex"), Buffer.from(expectedHex, "hex"));
    } catch {
      return false;
    }
  }

  async listWebhooks(
    orgId: string,
  ): Promise<
    Pick<Webhook, "id" | "name" | "url" | "isActive" | "createdAt">[]
  > {
    const list = await this.webhooks.listByOrg(orgId);
    return list.map((w) => ({
      id: w.id,
      name: w.name,
      url: w.url,
      isActive: w.isActive,
      createdAt: w.createdAt,
    }));
  }

  async register(
    orgId: string,
    data: { name: string; url: string; secret: string; isActive?: boolean },
  ): Promise<Pick<Webhook, "id" | "name" | "url" | "isActive" | "createdAt"> & { secret: string }> {
    const w = await this.webhooks.create({
      orgId,
      name: data.name,
      url: data.url,
      secret: data.secret,
      isActive: data.isActive ?? true,
    });
    return {
      id: w.id,
      name: w.name,
      url: w.url,
      isActive: w.isActive,
      createdAt: w.createdAt,
      secret: w.secret,
    };
  }

  async remove(id: string, orgId: string): Promise<boolean> {
    return this.webhooks.delete(id, orgId);
  }

  getDeliveryLog(orgId: string, options?: { limit?: number; webhookId?: string }) {
    return this.webhooks.listDeliveryLogs(orgId, {
      limit: options?.limit ?? 100,
      webhookId: options?.webhookId,
    });
  }

  /**
   * Enqueue delivery to a single webhook. Retries: BullMQ 3x with exponential backoff.
   */
  async enqueueDelivery(
    orgId: string,
    webhookId: string,
    event: unknown,
  ): Promise<{ jobId: string | undefined }> {
    const w = await this.webhooks.findById(webhookId, orgId);
    if (!w || !w.isActive) {
      throw new Error("Webhook not found or inactive");
    }
    const job = await webhookDeliveryQueue.add("deliver", {
      orgId,
      webhookId,
      event,
    } satisfies WebhookDeliveryJob);
    return { jobId: job.id };
  }

  /**
   * Fan-out an event to all active webhooks for the org.
   */
  async broadcastEvent(orgId: string, event: unknown): Promise<void> {
    const all = await this.webhooks.listByOrg(orgId);
    const targets = all.filter((h) => h.isActive);
    for (const w of targets) {
      await webhookDeliveryQueue.add(
        "deliver",
        {
          orgId,
          webhookId: w.id,
          event,
        } satisfies WebhookDeliveryJob,
        { jobId: `wh-${w.id}-${randomUUID()}` },
      );
    }
  }

  async processDeliveryJob(job: Job<WebhookDeliveryJob>): Promise<void> {
    const { orgId, webhookId, event } = job.data;
    const w = await this.webhooks.findById(webhookId, orgId);
    if (!w) {
      return;
    }
    if (!w.isActive) {
      return;
    }
    const attempt = job.attemptsMade + 1;
    try {
      await this.deliverHttp(w, event, attempt, WebhookService.maxJobAttempts);
    } catch (e) {
      this.appendLog({
        orgId: w.orgId,
        webhookId: w.id,
        event,
        responseStatus: null,
        error: e instanceof Error ? e.message : String(e),
        attempt,
        maxAttempts: WebhookService.maxJobAttempts,
        status: attempt < WebhookService.maxJobAttempts ? "retrying" : "failed",
      });
      throw e;
    }
  }

  private async deliverHttp(
    webhook: Webhook,
    event: unknown,
    attempt: number,
    maxAttempts: number,
  ): Promise<void> {
    const body = JSON.stringify(event);
    const rawSig = this.signPayload(body, webhook.secret);
    const signature = `${HMAC_PREFIX}${rawSig}`;

    const res = await fetch(webhook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Id": webhook.id,
        "X-Webhook-Event": eventTypeName(event),
        "X-Webhook-Attempt": String(attempt),
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    this.appendLog({
      orgId: webhook.orgId,
      webhookId: webhook.id,
      event,
      responseStatus: res.status,
      error: null,
      attempt,
      maxAttempts,
      status: "success",
    });
  }

  private appendLog(
    p: {
      orgId: string;
      webhookId: string;
      event: unknown;
      responseStatus: number | null;
      error: string | null;
      attempt: number;
      maxAttempts: number;
      status: WebhookDeliveryLog["status"];
    },
  ): void {
    this.webhooks.appendDeliveryLog({
      orgId: p.orgId,
      webhookId: p.webhookId,
      eventType: eventTypeName(p.event),
      responseStatus: p.responseStatus,
      error: p.error,
      attempt: p.attempt,
      maxAttempts: p.maxAttempts,
      status: p.status,
      bodySnippet: snippetJson(p.event),
    });
  }
}
