import { type Job, Worker } from "bullmq";

import { queueConnection } from "./connection.js";

export { queues } from "./queues/index.js";
export type {
  AuditJob,
  ExecutionJob,
  NotificationJob,
  SignalJob,
} from "./queues/index.js";

export function createWorker<T = unknown>(
  queueName: string,
  processor: (job: Job<T>) => Promise<void>,
): Worker {
  return new Worker<T>(queueName, processor, {
    connection: queueConnection,
    concurrency: 5,
    limiter: { max: 100, duration: 1000 },
  });
}
