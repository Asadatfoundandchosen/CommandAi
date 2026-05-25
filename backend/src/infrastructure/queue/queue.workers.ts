import type { Job } from "bullmq";

import { stopDlqRetentionCleanup } from "./dlq/dlq.cleanup.js";
import { closeDlqQueues } from "./dlq/setup-dlq.js";
import { createWorker, queues } from "./queue.service.js";
import { container } from "../../container.js";
import type { ContractExpiryNotificationService } from "../../modules/contract/contract.expiry-notifications.js";
import type { ContractRenewalService } from "../../modules/contract/contract-renewal.service.js";
import { CONTRACT_RENEWAL_DAILY_SCAN_JOB } from "../../modules/contract/contract-renewal.constants.js";
import type { ExecutionService } from "../../modules/execution/execution.service.js";
import type { WebhookService } from "../../modules/webhooks/webhook.service.js";
import type { CreditAlertService } from "../../modules/credits/credit-alert.service.js";
import { CREDIT_ALERT_TEMPLATE_ID } from "../../modules/credits/credit-alert.constants.js";
import { MFA_POLICY_DAILY_REMINDER_JOB } from "../../modules/mfa-policy/mfa-policy.constants.js";
import type { MfaPolicyReminderService } from "../../modules/mfa-policy/mfa-policy-reminder.service.js";
import type { SignalService } from "../../modules/signals/signals.service.js";
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

async function notificationProcessor(job: Job<NotificationJob>): Promise<void> {
  const { templateId } = job.data;
  if (templateId === CREDIT_ALERT_TEMPLATE_ID) {
    const alerts = container.get<CreditAlertService>(TYPES.CreditAlertService);
    await alerts.processNotificationJob(job.data);
    return;
  }
  if (templateId === MFA_POLICY_DAILY_REMINDER_JOB) {
    const reminders = container.get<MfaPolicyReminderService>(
      TYPES.MfaPolicyReminderService,
    );
    await reminders.processDailyReminderJob(job.data);
    return;
  }
  if (
    templateId === CONTRACT_RENEWAL_DAILY_SCAN_JOB ||
    templateId.startsWith("contract-renewal")
  ) {
    const renewal = container.get<ContractRenewalService>(TYPES.ContractRenewalService);
    await renewal.processNotificationJob(job.data);
    return;
  }

  const expiry = container.get<ContractExpiryNotificationService>(
    TYPES.ContractExpiryNotificationService,
  );
  await expiry.processNotificationJob(job.data);
}

async function signalProcessor(job: Job<SignalJob>): Promise<void> {
  const svc = container.get<SignalService>(TYPES.SignalService);
  await svc.processSignalJob(job.data);
}

async function executionProcessor(job: Job<ExecutionJob>): Promise<void> {
  const svc = container.get<ExecutionService>(TYPES.ExecutionService);
  await svc.processExecutionJob(job.data);
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
    createWorker<SignalJob>("signals", (job) => signalProcessor(job)),
    createWorker<ExecutionJob>("execution", (job) => executionProcessor(job)),
    createWorker<NotificationJob>("notifications", (job) => notificationProcessor(job)),
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
