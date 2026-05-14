import type { Queue, Worker } from "bullmq";

import {
  auditQueue,
  executionQueue,
  notificationQueue,
  signalQueue,
  webhookDeliveryQueue,
} from "../queues/index.js";
import { startDlqRetentionCleanup } from "./dlq.cleanup.js";
import { getDlqQueues, setupDLQ } from "./setup-dlq.js";

/** Wire DLQ listeners after workers exist; starts 30d retention sweep (daily). */
export function initAllDlqHandlers(workers: Worker[]): void {
  if (getDlqQueues().length > 0) {
    return;
  }
  if (workers.length !== 5) {
    process.stderr.write(
      `[DLQ] expected 5 workers, got ${workers.length}; skipping DLQ wiring\n`,
    );
    return;
  }
  const pairs: [Queue, Worker][] = [
    [signalQueue, workers[0]],
    [executionQueue, workers[1]],
    [notificationQueue, workers[2]],
    [auditQueue, workers[3]],
    [webhookDeliveryQueue, workers[4]],
  ];
  for (const [q, w] of pairs) {
    setupDLQ(q, w);
  }
  startDlqRetentionCleanup(getDlqQueues);
}
