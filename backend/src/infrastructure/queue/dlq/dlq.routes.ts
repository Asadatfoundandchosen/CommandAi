import { Job, type Queue } from "bullmq";
import { Router } from "express";

import {
  auditQueue,
  executionQueue,
  notificationQueue,
  signalQueue,
} from "../queues/index.js";
import { getDlqQueues } from "./setup-dlq.js";
import type { DlqEnvelope } from "./setup-dlq.js";

const sourceByName: Record<string, Queue | undefined> = {
  signals: signalQueue,
  execution: executionQueue,
  notifications: notificationQueue,
  audit: auditQueue,
};

function findDlq(sourceName: string): { source: Queue; dlq: Queue } | null {
  const source = sourceByName[sourceName];
  if (!source) {
    return null;
  }
  const dlqName = `${sourceName}-dlq`;
  const dlq = getDlqQueues().find((q) => q.name === dlqName);
  if (!dlq) {
    return null;
  }
  return { source, dlq };
}

/**
 * GET /api/dlq — aggregate counts per DLQ (dashboard).
 * POST /api/dlq/:queueName/retry/:jobId — re-queue payload to the source queue and remove DLQ job.
 */
export function createDlqRouter(): Router {
  const router = Router();

  router.get("/", async (_req, res) => {
    try {
      const dlqs = getDlqQueues();
      const rows = await Promise.all(
        dlqs.map(async (dlq) => {
          const counts = await dlq.getJobCounts(
            "waiting",
            "active",
            "delayed",
            "completed",
            "failed",
          );
          return {
            dlqName: dlq.name,
            counts,
          };
        }),
      );
      res.status(200).json({ dlqs: rows, threshold: 100 });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  router.post("/:queueName/retry/:jobId", async (req, res) => {
    const { queueName, jobId } = req.params;
    const found = findDlq(queueName);
    if (!found) {
      res.status(404).json({ error: "Unknown queue or DLQ not initialized" });
      return;
    }
    const { source, dlq } = found;
    try {
      const job = await Job.fromId(dlq, jobId);
      if (!job) {
        res.status(404).json({ error: "DLQ job not found" });
        return;
      }
      const data = job.data as DlqEnvelope;
      await source.add(
        data.originalJobName || "retry",
        data.originalJob as never,
      );
      await job.remove();
      res.status(200).json({ ok: true, requeuedTo: source.name });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  return router;
}
