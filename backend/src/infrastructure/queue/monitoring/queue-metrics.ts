import { Gauge, Registry } from "prom-client";

import { config } from "@config/index.js";

import { getDlqQueues } from "../dlq/setup-dlq.js";
import { queues } from "../queues/index.js";

/** Dedicated registry so we do not collide with future default metrics. */
export const queueMetricsRegister = new Registry();

const queueSizeGauge = new Gauge({
  name: "bullmq_queue_size",
  help: "Number of jobs in a BullMQ queue by status (scrape for depth / backlog alerts).",
  labelNames: ["queue", "status"],
  registers: [queueMetricsRegister],
});

let pollHandle: ReturnType<typeof setInterval> | undefined;

async function collectOnce(): Promise<void> {
  const named: { label: string; q: { getJobCounts: () => Promise<Record<string, number>> } }[] =
    Object.entries(queues).map(([label, q]) => ({ label, q }));

  for (const dlq of getDlqQueues()) {
    named.push({ label: dlq.name, q: dlq });
  }

  for (const { label, q } of named) {
    const counts = await q.getJobCounts();
    const keys = [
      "waiting",
      "active",
      "failed",
      "delayed",
      "completed",
      "paused",
    ] as const;
    for (const k of keys) {
      queueSizeGauge.set({ queue: label, status: k }, counts[k] ?? 0);
    }
  }
}

export function startQueueMetricsCollector(): void {
  if (pollHandle) {
    return;
  }
  const ms = config.queueMonitoring.metricsIntervalMs;
  void collectOnce().catch((e) => {
    process.stderr.write(`queue metrics initial collect failed: ${String(e)}\n`);
  });
  pollHandle = setInterval(() => {
    void collectOnce().catch((e) => {
      process.stderr.write(`queue metrics collect failed: ${String(e)}\n`);
    });
  }, ms);
}

export function stopQueueMetricsCollector(): void {
  if (pollHandle) {
    clearInterval(pollHandle);
    pollHandle = undefined;
  }
}
