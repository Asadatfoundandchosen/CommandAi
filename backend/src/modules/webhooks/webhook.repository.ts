import { randomUUID } from "node:crypto";
import { injectable } from "inversify";

import type { Webhook, WebhookDeliveryLog } from "./webhook.model.js";

const MAX_LOGS = 2_000;

@injectable()
export class WebhookRepository {
  private webhooks = new Map<string, Webhook>();
  private readonly logs: WebhookDeliveryLog[] = [];

  async create(data: Omit<Webhook, "id" | "createdAt" | "updatedAt">): Promise<Webhook> {
    const now = new Date();
    const w: Webhook = {
      ...data,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.webhooks.set(w.id, w);
    return w;
  }

  async findById(id: string, orgId: string): Promise<Webhook | null> {
    const w = this.webhooks.get(id);
    if (!w || w.orgId !== orgId) {
      return null;
    }
    return w;
  }

  async listByOrg(orgId: string): Promise<Webhook[]> {
    return [...this.webhooks.values()].filter((w) => w.orgId === orgId);
  }

  async delete(id: string, orgId: string): Promise<boolean> {
    const w = this.webhooks.get(id);
    if (!w || w.orgId !== orgId) {
      return false;
    }
    this.webhooks.delete(id);
    return true;
  }

  appendDeliveryLog(entry: Omit<WebhookDeliveryLog, "id" | "createdAt">): WebhookDeliveryLog {
    const full: WebhookDeliveryLog = {
      ...entry,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.logs.push(full);
    if (this.logs.length > MAX_LOGS) {
      this.logs.splice(0, this.logs.length - MAX_LOGS);
    }
    return full;
  }

  listDeliveryLogs(
    orgId: string,
    options?: { limit: number; webhookId?: string },
  ): WebhookDeliveryLog[] {
    const limit = options?.limit ?? 100;
    const wid = options?.webhookId;
    let rows = this.logs.filter((l) => l.orgId === orgId);
    if (wid) {
      rows = rows.filter((l) => l.webhookId === wid);
    }
    return rows
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }
}
