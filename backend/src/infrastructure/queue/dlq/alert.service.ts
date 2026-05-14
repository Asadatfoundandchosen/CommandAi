/** Hook for PagerDuty / Slack / metrics — replace with real integrations in production. */
export async function sendDlqAlert(payload: {
  queue: string;
  count: number;
  threshold: number;
}): Promise<void> {
  process.stderr.write(
    `[DLQ ALERT] queue=${payload.queue} waitingCount=${payload.count} threshold=${payload.threshold}\n`,
  );
}
