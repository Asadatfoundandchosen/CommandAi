import type { Queue } from "bullmq";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;

/** Remove DLQ jobs older than 30 days (waiting state — DLQ jobs are not consumed by default). */
export async function purgeDlqOlderThan(
  dlq: Queue,
  maxAgeMs: number,
): Promise<number> {
  const jobs = await dlq.getJobs(["waiting", "delayed"], 0, 5000, true);
  let removed = 0;
  const now = Date.now();
  for (const job of jobs) {
    if (now - job.timestamp > maxAgeMs) {
      await job.remove();
      removed += 1;
    }
  }
  return removed;
}

export function startDlqRetentionCleanup(
  getDlqs: () => readonly Queue[],
): void {
  if (intervalId !== null) {
    return;
  }
  const run = async (): Promise<void> => {
    for (const dlq of getDlqs()) {
      try {
        const n = await purgeDlqOlderThan(dlq, THIRTY_DAYS_MS);
        if (n > 0) {
          process.stdout.write(
            `[DLQ cleanup] ${dlq.name} removed ${n} job(s) older than 30d\n`,
          );
        }
      } catch (e) {
        process.stderr.write(`[DLQ cleanup] ${dlq.name}: ${String(e)}\n`);
      }
    }
  };
  void run();
  intervalId = setInterval(
    () => {
      void run();
    },
    24 * 60 * 60 * 1000,
  );
}

export function stopDlqRetentionCleanup(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
