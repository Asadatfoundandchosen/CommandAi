import { Queue } from "bullmq";

import { queueConnection } from "../connection.js";

/** High-volume signal ingestion — tuned for throughput and bounded Redis retention. */
export interface SignalJob {
  signalId: string;
  orgId: string;
  /** Business unit charged for this signal (24-char hex ObjectId). Omit for system/cron jobs. */
  accountId?: string;
  agentId: string;
  payload: Record<string, unknown>;
}

export const signalQueue = new Queue<SignalJob>("signals", {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});
