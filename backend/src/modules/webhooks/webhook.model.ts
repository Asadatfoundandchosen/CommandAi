/** Registered outbound webhook endpoint (per org). */
export type Webhook = {
  id: string;
  orgId: string;
  name: string;
  url: string;
  /** HMAC-SHA256 secret; never return in list responses. */
  secret: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type WebhookDeliveryLog = {
  id: string;
  orgId: string;
  webhookId: string;
  eventType: string;
  status: "success" | "failed" | "retrying";
  responseStatus: number | null;
  error: string | null;
  attempt: number;
  maxAttempts: number;
  bodySnippet: string;
  createdAt: Date;
};
