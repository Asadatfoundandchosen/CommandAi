import type { Job } from "bullmq";

import { stopDlqRetentionCleanup } from "./dlq/dlq.cleanup.js";
import { closeDlqQueues } from "./dlq/setup-dlq.js";
import { createWorker, queues } from "./queue.service.js";
import { container } from "../../container.js";
import type { WebhookService } from "../../modules/webhooks/webhook.service.js";
import { TYPES } from "../../types.js";
import type {
  AuditJob,
  ExecutionJob,
  NotificationJob,
  SignalJob,
} from "./queues/index.js";
import type { WebhookDeliveryJob } from "./queues/webhook-delivery.queue.js";
const workers: ReturnType<typeof createWorker>[] = [];

export function getWorkers(): ReturnType<typeof createWorker>[] {
  return [...workers];
}

async function stubProcessor(queueLabel: string, job: Job): Promise<void> {
  process.stdout.write(
    `[bullmq:${queueLabel}] job id=${String(job.id)} name=${job.name}\n`,
  );
}

async function webhookDeliveryProcessor(job: Job<WebhookDeliveryJob>): Promise<void> {
  const svc = container.get<WebhookService>(TYPES.WebhookService);
  await svc.processDeliveryJob(job);
}

/** Starts one worker per named queue (signals, execution, notifications, audit). Idempotent. */
export function startBullMqWorkers(): void {
  if (workers.length > 0) {
    return;
  }
  workers.push(
    createWorker<SignalJob>("signals", (job) => stubProcessor("signals", job)),
    createWorker<ExecutionJob>("execution", (job) =>
      stubProcessor("execution", job),
    ),
    createWorker<NotificationJob>("notifications", (job) =>
      stubProcessor("notifications", job),
    ),
    createWorker<AuditJob>("audit", (job) => stubProcessor("audit", job)),
    createWorker<WebhookDeliveryJob>("webhook-delivery", (job) =>
      webhookDeliveryProcessor(job),
    ),
  );
}

/** Closes workers first, then source queues, then DLQs (BullMQ / Redis). Call before closing the shared Redis client. */
export async function closeBullMqQueuesAndWorkers(): Promise<void> {
  stopDlqRetentionCleanup();
  await Promise.all(workers.map((w) => w.close()));
  workers.length = 0;
  await Promise.all(Object.values(queues).map((q) => q.close()));
  await closeDlqQueues();
}
