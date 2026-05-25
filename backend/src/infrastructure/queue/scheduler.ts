import type { Queue } from "bullmq";

import { queues } from "./queues/index.js";
import {
  CONTRACT_EXPIRY_DAILY_SCAN_JOB,
} from "../../modules/contract/contract.expiry-notifications.js";
import { CONTRACT_RENEWAL_DAILY_SCAN_JOB } from "../../modules/contract/contract-renewal.constants.js";
import { MFA_POLICY_DAILY_REMINDER_JOB } from "../../modules/mfa-policy/mfa-policy.constants.js";
import { ADMIN_WEEKLY_REPORT_JOB } from "../../modules/audit/admin-weekly-report.constants.js";
import { AUDIT_RETENTION_DAILY_JOB } from "../../modules/retention/retention.constants.js";
import type { NotificationJob } from "./queues/notification.queue.js";
import type { SignalJob } from "./queues/signal.queue.js";

/** In-memory overrides (lost on restart — persist in DB for production). */
const scheduleOverrides = new Map<
  string,
  Partial<{ cron: string; timezone: string }>
>();

export type ScheduledJobEntry =
  | {
      kind: "notification";
      name: string;
      queue: (typeof queues)["notifications"];
      cron: string;
      timezone: string;
      data: NotificationJob;
    }
  | {
      kind: "signal";
      name: string;
      queue: (typeof queues)["signals"];
      cron: string;
      timezone: string;
      data: SignalJob;
    };

/** Cron schedules — BullMQ `repeat.pattern` + `tz` (IANA, e.g. `UTC`, `America/New_York`). */
export const scheduledJobs: ScheduledJobEntry[] = [
  {
    kind: "notification",
    name: "daily-credit-alert",
    queue: queues.notifications,
    cron: "0 9 * * *",
    timezone: "UTC",
    data: {
      orgId: "system",
      recipientKey: "credit-alert",
      templateId: "credit-summary",
      payload: { type: "credit-summary" },
    },
  },
  {
    kind: "signal",
    name: "hourly-signal-aggregation",
    queue: queues.signals,
    cron: "0 * * * *",
    timezone: "UTC",
    data: {
      signalId: "scheduled-hourly",
      orgId: "system",
      agentId: "signal-aggregator",
      payload: { type: "aggregate" },
    },
  },
  {
    kind: "notification",
    name: "weekly-report",
    queue: queues.notifications,
    cron: "0 8 * * 1",
    timezone: "UTC",
    data: {
      orgId: "system",
      recipientKey: "weekly-report",
      templateId: "weekly-report",
      payload: { type: "weekly-report" },
    },
  },
  {
    kind: "notification",
    name: CONTRACT_EXPIRY_DAILY_SCAN_JOB,
    queue: queues.notifications,
    cron: "0 7 * * *",
    timezone: "UTC",
    data: {
      orgId: "system",
      recipientKey: "contract-expiry-scan",
      templateId: CONTRACT_EXPIRY_DAILY_SCAN_JOB,
      payload: { type: "contract-expiry-daily-scan" },
    },
  },
  {
    kind: "notification",
    name: CONTRACT_RENEWAL_DAILY_SCAN_JOB,
    queue: queues.notifications,
    cron: "15 7 * * *",
    timezone: "UTC",
    data: {
      orgId: "system",
      recipientKey: "contract-renewal-scan",
      templateId: CONTRACT_RENEWAL_DAILY_SCAN_JOB,
      payload: { type: "contract-renewal-daily-scan" },
    },
  },
  {
    kind: "notification",
    name: MFA_POLICY_DAILY_REMINDER_JOB,
    queue: queues.notifications,
    cron: "30 8 * * *",
    timezone: "UTC",
    data: {
      orgId: "system",
      recipientKey: "mfa-policy-reminder",
      templateId: MFA_POLICY_DAILY_REMINDER_JOB,
      payload: { type: MFA_POLICY_DAILY_REMINDER_JOB },
    },
  },
  {
    kind: "notification",
    name: ADMIN_WEEKLY_REPORT_JOB,
    queue: queues.notifications,
    cron: "0 9 * * 1",
    timezone: "UTC",
    data: {
      orgId: "system",
      recipientKey: "admin-weekly-audit",
      templateId: ADMIN_WEEKLY_REPORT_JOB,
      payload: { type: ADMIN_WEEKLY_REPORT_JOB },
    },
  },
  {
    kind: "notification",
    name: AUDIT_RETENTION_DAILY_JOB,
    queue: queues.notifications,
    cron: "0 3 * * *",
    timezone: "UTC",
    data: {
      orgId: "system",
      recipientKey: "audit-retention-scan",
      templateId: AUDIT_RETENTION_DAILY_JOB,
      payload: { type: AUDIT_RETENTION_DAILY_JOB },
    },
  },
];

function effectiveSchedule(job: ScheduledJobEntry): {
  cron: string;
  timezone: string;
} {
  const o = scheduleOverrides.get(job.name);
  return {
    cron: o?.cron ?? job.cron,
    timezone: o?.timezone ?? job.timezone,
  };
}

async function removeRepeatableForJob(
  queue: Queue,
  jobName: string,
): Promise<void> {
  const list = await queue.getRepeatableJobs();
  for (const r of list) {
    if (r.name === jobName || r.key.includes(jobName)) {
      await queue.removeRepeatableByKey(r.key);
    }
  }
}

const repeatOpts = (job: ScheduledJobEntry, cron: string, timezone: string) =>
  ({
    repeat: {
      pattern: cron,
      tz: timezone,
      key: job.name,
      immediately: true,
    },
  }) as const;

async function registerRepeatable(job: ScheduledJobEntry): Promise<void> {
  const { cron, timezone } = effectiveSchedule(job);
  await removeRepeatableForJob(job.queue, job.name);
  const opts = repeatOpts(job, cron, timezone);
  switch (job.kind) {
    case "notification":
      await queues.notifications.add(job.name, job.data, opts);
      return;
    case "signal":
      await queues.signals.add(job.name, job.data, opts);
      return;
  }
}

/** Register repeatable jobs. Idempotent per `repeat.key`. `immediately` runs a catch-up if the slot was missed (process was down). */
export async function initScheduler(): Promise<void> {
  for (const job of scheduledJobs) {
    await registerRepeatable(job);
  }
}

export function setScheduleOverride(
  name: string,
  patch: Partial<{ cron: string; timezone: string }>,
): void {
  scheduleOverrides.set(name, {
    ...scheduleOverrides.get(name),
    ...patch,
  });
}

export function getScheduleOverrides(): ReadonlyMap<
  string,
  Partial<{ cron: string; timezone: string }>
> {
  return scheduleOverrides;
}

/** Re-register one job after admin PATCH (uses current overrides). */
export async function resyncScheduledJob(name: string): Promise<void> {
  const job = scheduledJobs.find((j) => j.name === name);
  if (!job) {
    throw new Error(`Unknown schedule: ${name}`);
  }
  await registerRepeatable(job);
}
