import { Queue } from "bullmq";

import { queueConnection } from "../connection.js";

/** Email/push/etc. — may lag under load; lower priority than execution (higher number = lower priority in BullMQ). */
export interface NotificationJob {
  orgId: string;
  recipientKey: string;
  templateId: string;
  payload: Record<string, unknown>;
}

export const notificationQueue = new Queue<NotificationJob>("notifications", {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    priority: 10,
  },
});
