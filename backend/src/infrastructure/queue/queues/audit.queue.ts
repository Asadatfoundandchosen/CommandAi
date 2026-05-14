import { Queue } from "bullmq";

import { queueConnection } from "../connection.js";

/** Compliance / audit trail — durable retries, bounded completion history. */
export interface AuditJob {
  orgId: string;
  eventType: string;
  actorId: string;
  resourceId: string;
  payload: Record<string, unknown>;
}

export const auditQueue = new Queue<AuditJob>("audit", {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 3000 },
    removeOnComplete: 200,
    removeOnFail: 2000,
  },
});
