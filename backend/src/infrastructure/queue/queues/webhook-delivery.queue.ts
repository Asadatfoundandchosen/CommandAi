import { Queue } from "bullmq";

import { queueConnection } from "../connection.js";

/** Outbound HTTP webhooks — 3 attempts, exponential backoff. */
export interface WebhookDeliveryJob {
  orgId: string;
  webhookId: string;
  /** JSON-serializable event envelope or payload. */
  event: unknown;
}

export const webhookDeliveryQueue = new Queue<WebhookDeliveryJob>(
  "webhook-delivery",
  {
    connection: queueConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 200,
      removeOnFail: 2000,
    },
  },
);
