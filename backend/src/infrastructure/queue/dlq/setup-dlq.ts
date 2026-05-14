import type { Job as BullJob } from "bullmq";
import { Queue, type Worker } from "bullmq";

import { queueConnection } from "../connection.js";
import { sendDlqAlert } from "./alert.service.js";

const DLQ_ALERT_THRESHOLD = 100;

export interface DlqEnvelope {
  originalJob: unknown;
  originalJobName: string;
  sourceJobId: string | undefined;
  error: string;
  stack: string | undefined;
  failedAt: string;
}

const dlqHandles: Queue[] = [];

export function getDlqQueues(): readonly Queue[] {
  return dlqHandles;
}

export async function closeDlqQueues(): Promise<void> {
  await Promise.all(dlqHandles.map((q) => q.close()));
  dlqHandles.length = 0;
}

/**
 * After max retries, copy failed job payload into a `{name}-dlq` queue for inspection.
 * Uses the worker `failed` event (BullMQ `Queue` does not emit per-job failures).
 */
export function setupDLQ(sourceQueue: Queue, worker: Worker): Queue {
  const dlqName = `${sourceQueue.name}-dlq`;
  const dlq = new Queue(dlqName, { connection: queueConnection });
  dlqHandles.push(dlq);

  worker.on("failed", async (job: BullJob | undefined, err: Error) => {
    if (!job) {
      return;
    }
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) {
      return;
    }

    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;

    await dlq.add("failed-job", {
      originalJob: job.data,
      originalJobName: job.name,
      sourceJobId: job.id,
      error: message,
      stack,
      failedAt: new Date().toISOString(),
    } satisfies DlqEnvelope);

    const { waiting = 0 } = await dlq.getJobCounts("waiting");
    if (waiting > DLQ_ALERT_THRESHOLD) {
      await sendDlqAlert({
        queue: sourceQueue.name,
        count: waiting,
        threshold: DLQ_ALERT_THRESHOLD,
      });
    }
  });

  return dlq;
}
