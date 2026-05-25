import { Queue } from "bullmq";

import { queueConnection } from "../connection.js";

/** Critical agent / workflow execution — higher default priority and more retries. */
export interface ExecutionJob {
  executionId: string;
  orgId: string;
  /** Business unit charged for this execution (24-char hex ObjectId). */
  accountId?: string;
  runId: string;
  payload: Record<string, unknown>;
}

export const executionQueue = new Queue<ExecutionJob>("execution", {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 2000 },
    priority: 1,
  },
});
