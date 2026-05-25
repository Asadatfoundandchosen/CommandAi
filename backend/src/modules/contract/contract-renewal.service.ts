import { inject, injectable } from "inversify";
import { Types } from "mongoose";

import { queues } from "../../infrastructure/queue/queues/index.js";
import type { NotificationJob } from "../../infrastructure/queue/queues/notification.queue.js";
import { TYPES } from "../../types.js";
import { daysUntilDate } from "./contract.dto.js";
import type { IContract } from "./contract.model.js";
import { addBillingPeriod, addDaysUtc } from "./contract-renewal.dates.js";
import {
  CONTRACT_RENEWAL_DAILY_SCAN_JOB,
  CONTRACT_RENEWAL_FAILED_ADMIN_TEMPLATE,
  CONTRACT_RENEWAL_GRACE_SUSPEND_TEMPLATE,
  CONTRACT_RENEWAL_REMINDER_TEMPLATE,
  CONTRACT_RENEWAL_SUCCESS_TEMPLATE,
  RENEWAL_GRACE_PERIOD_DAYS,
  RENEWAL_MAX_ATTEMPTS,
  RENEWAL_REMINDER_DAYS,
  RENEWAL_WINDOW_DAYS,
} from "./contract-renewal.constants.js";
import { ContractRepository } from "./contract.repository.js";
import type { OrganizationRepository } from "../organization/organization.repository.js";

const PLATFORM_SYSTEM_ACTOR = new Types.ObjectId("000000000000000000000001");

function renewalReminderMessage(
  contract: IContract,
  daysRemaining: number,
): string {
  if (daysRemaining === 30) {
    return `Upcoming renewal: contract ${contract.contract_number} will auto-renew in 30 days on ${contract.end_date.toISOString().slice(0, 10)}.`;
  }
  if (daysRemaining === 7) {
    return `Final reminder: contract ${contract.contract_number} auto-renews in 7 days on ${contract.end_date.toISOString().slice(0, 10)}.`;
  }
  if (daysRemaining === 0) {
    return `Contract ${contract.contract_number} reaches its renewal date today. Auto-renewal will be processed shortly.`;
  }
  return `Contract ${contract.contract_number} renews in ${daysRemaining} days.`;
}

@injectable()
export class ContractRenewalService {
  constructor(
    @inject(TYPES.ContractRepository)
    private readonly contracts: ContractRepository,
    @inject(TYPES.OrganizationRepository)
    private readonly organizations: OrganizationRepository,
  ) {}

  /** Daily BullMQ entry: grace suspensions, reminders, and renewal processing. */
  async processRenewals(now: Date = new Date()): Promise<{
    graceSuspended: number;
    reminders: number;
    renewed: number;
    failed: number;
  }> {
    const graceSuspended = await this.processGracePeriodExpirations(now);

    const inWindow = await this.contracts.findAutoRenewExpiringWithinDays(
      now,
      RENEWAL_WINDOW_DAYS,
    );
    const pastEnd = await this.contracts.findAutoRenewPastEndPending(now);
    const seen = new Set<string>();
    const expiringContracts: IContract[] = [];
    for (const c of [...inWindow, ...pastEnd]) {
      const id = String(c._id);
      if (!seen.has(id)) {
        seen.add(id);
        expiringContracts.push(c);
      }
    }

    let reminders = 0;
    let renewed = 0;
    let failed = 0;

    for (const contract of expiringContracts) {
      const daysRemaining = daysUntilDate(contract.end_date, now);
      const sent = contract.renewal_reminder_days_sent ?? [];

      for (const threshold of RENEWAL_REMINDER_DAYS) {
        if (daysRemaining === threshold && !sent.includes(threshold)) {
          await this.enqueueRenewalReminder(contract, threshold, now);
          await this.contracts.updateById(String(contract._id), {
            $addToSet: { renewal_reminder_days_sent: threshold },
            $set: { updated_by: PLATFORM_SYSTEM_ACTOR },
          });
          reminders += 1;
        }
      }

      if (
        daysRemaining <= 0 &&
        !(contract.grace_period_end && contract.grace_period_end > now)
      ) {
        const result = await this.processRenewal(contract, now);
        if (result === "renewed") {
          renewed += 1;
        } else if (result === "failed") {
          failed += 1;
        }
      }
    }

    return { graceSuspended, reminders, renewed, failed };
  }

  async processRenewal(
    contract: IContract,
    now: Date = new Date(),
  ): Promise<"renewed" | "failed" | "grace" | "skipped"> {
    const id = String(contract._id);
    const attempts = contract.renewal_attempts ?? 0;

    if (contract.grace_period_end && contract.grace_period_end > now) {
      return "grace";
    }

    if (attempts >= RENEWAL_MAX_ATTEMPTS && contract.grace_period_end) {
      return "skipped";
    }

    const nextAttempt = attempts + 1;
    await this.contracts.updateById(id, {
      $set: {
        renewal_attempts: nextAttempt,
        renewal_last_attempt_at: now,
        updated_by: PLATFORM_SYSTEM_ACTOR,
      },
    });

    try {
      const orgId = String(contract.org_id);
      const org = await this.organizations.findById(orgId);
      if (!org) {
        throw new Error(`Organization not found: ${orgId}`);
      }

      const newStart = new Date(contract.end_date.getTime());
      const newEnd = addBillingPeriod(newStart, contract.billing.billing_cycle);
      const credits = contract.credits.renewal_allocation;

      await this.organizations.updateById(orgId, {
        $inc: { "billing.allocated_credits": credits },
      });

      await this.contracts.updateById(id, {
        $set: {
          start_date: newStart,
          end_date: newEnd,
          renewal_processed: false,
          renewal_attempts: 0,
          renewal_last_attempt_at: undefined,
          grace_period_end: undefined,
          renewed_at: now,
          renewal_reminder_days_sent: [],
          updated_by: PLATFORM_SYSTEM_ACTOR,
        },
      });

      await this.enqueueRenewalSuccess(contract, newEnd, credits, now);
      process.stdout.write(
        `[contract-renewal] renewed contract=${contract.contract_number} org=${orgId} until=${newEnd.toISOString()}\n`,
      );
      return "renewed";
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(
        `[contract-renewal] attempt ${nextAttempt}/${RENEWAL_MAX_ATTEMPTS} failed contract=${contract.contract_number}: ${message}\n`,
      );

      if (nextAttempt >= RENEWAL_MAX_ATTEMPTS) {
        const graceEnd = addDaysUtc(now, RENEWAL_GRACE_PERIOD_DAYS);
        await this.contracts.updateById(id, {
          $set: {
            grace_period_end: graceEnd,
            updated_by: PLATFORM_SYSTEM_ACTOR,
          },
        });
        await this.enqueueRenewalFailedAdmin(contract, nextAttempt, graceEnd, message, now);
        return "grace";
      }

      return "failed";
    }
  }

  async processGracePeriodExpirations(now: Date = new Date()): Promise<number> {
    const expired = await this.contracts.findGracePeriodExpired(now);
    let count = 0;

    for (const contract of expired) {
      const orgId = String(contract.org_id);
      const id = String(contract._id);

      await this.organizations.updateById(orgId, {
        $set: { status: "suspended" },
      });
      await this.contracts.updateById(id, {
        $set: {
          status: "terminated",
          renewal_processed: true,
          updated_by: PLATFORM_SYSTEM_ACTOR,
        },
      });
      await this.enqueueGraceSuspend(contract, now);
      process.stdout.write(
        `[contract-renewal] grace expired — suspended org=${orgId} terminated contract=${contract.contract_number}\n`,
      );
      count += 1;
    }

    return count;
  }

  async runDailyRenewalScan(now: Date = new Date()): Promise<void> {
    const stats = await this.processRenewals(now);
    process.stdout.write(
      `[contract-renewal] daily scan grace=${stats.graceSuspended} reminders=${stats.reminders} renewed=${stats.renewed} failed=${stats.failed}\n`,
    );
  }

  async processNotificationJob(job: NotificationJob): Promise<void> {
    if (job.templateId === CONTRACT_RENEWAL_DAILY_SCAN_JOB) {
      await this.runDailyRenewalScan();
      return;
    }

    if (job.templateId === CONTRACT_RENEWAL_REMINDER_TEMPLATE) {
      process.stdout.write(
        `[contract-renewal] reminder org=${job.orgId} contract=${String(job.payload.contractNumber ?? "")} days=${String(job.payload.daysRemaining ?? "")} — ${String(job.payload.message ?? "")}\n`,
      );
      return;
    }

    if (job.templateId === CONTRACT_RENEWAL_SUCCESS_TEMPLATE) {
      process.stdout.write(
        `[contract-renewal] success org=${job.orgId} contract=${String(job.payload.contractNumber ?? "")} newEnd=${String(job.payload.newEndDate ?? "")}\n`,
      );
      return;
    }

    if (job.templateId === CONTRACT_RENEWAL_FAILED_ADMIN_TEMPLATE) {
      process.stdout.write(
        `[contract-renewal] FAILED (admin) org=${job.orgId} contract=${String(job.payload.contractNumber ?? "")} attempts=${String(job.payload.attempts ?? "")} graceUntil=${String(job.payload.gracePeriodEnd ?? "")} error=${String(job.payload.error ?? "")}\n`,
      );
      return;
    }

    if (job.templateId === CONTRACT_RENEWAL_GRACE_SUSPEND_TEMPLATE) {
      process.stdout.write(
        `[contract-renewal] grace expired — suspended org=${job.orgId} contract=${String(job.payload.contractNumber ?? "")}\n`,
      );
    }
  }

  private async enqueueRenewalReminder(
    contract: IContract,
    daysRemaining: number,
    now: Date,
  ): Promise<void> {
    const orgId = String(contract.org_id);
    const job: NotificationJob = {
      orgId,
      recipientKey: `org-admin:${orgId}`,
      templateId: CONTRACT_RENEWAL_REMINDER_TEMPLATE,
      payload: {
        contractId: String(contract._id),
        contractNumber: contract.contract_number,
        daysRemaining,
        message: renewalReminderMessage(contract, daysRemaining),
        endDate: contract.end_date.toISOString(),
        autoRenew: contract.auto_renew,
        kind: daysRemaining === 30 ? "upcoming" : daysRemaining === 7 ? "final" : "due",
      },
    };

    await queues.notifications.add(CONTRACT_RENEWAL_REMINDER_TEMPLATE, job, {
      jobId: `contract-renewal-reminder:${orgId}:${String(contract._id)}:${daysRemaining}:${now.toISOString().slice(0, 10)}`,
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  private async enqueueRenewalSuccess(
    contract: IContract,
    newEnd: Date,
    credits: number,
    now: Date,
  ): Promise<void> {
    const orgId = String(contract.org_id);
    const job: NotificationJob = {
      orgId,
      recipientKey: `org-admin:${orgId}`,
      templateId: CONTRACT_RENEWAL_SUCCESS_TEMPLATE,
      payload: {
        contractId: String(contract._id),
        contractNumber: contract.contract_number,
        message: `Contract ${contract.contract_number} was renewed successfully. ${credits} credits were added to your account.`,
        newEndDate: newEnd.toISOString(),
        creditsAdded: credits,
      },
    };

    await queues.notifications.add(CONTRACT_RENEWAL_SUCCESS_TEMPLATE, job, {
      jobId: `contract-renewal-success:${orgId}:${String(contract._id)}:${now.toISOString().slice(0, 10)}`,
      removeOnComplete: true,
      removeOnFail: 100,
    });

    const day0Job: NotificationJob = {
      ...job,
      templateId: CONTRACT_RENEWAL_REMINDER_TEMPLATE,
      payload: {
        ...job.payload,
        daysRemaining: 0,
        message: `Contract ${contract.contract_number} renewal has been processed. New end date: ${newEnd.toISOString().slice(0, 10)}.`,
        kind: "processed",
      },
    };
    await queues.notifications.add(CONTRACT_RENEWAL_REMINDER_TEMPLATE, day0Job, {
      jobId: `contract-renewal-processed:${orgId}:${String(contract._id)}:${now.toISOString().slice(0, 10)}`,
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  private async enqueueRenewalFailedAdmin(
    contract: IContract,
    attempts: number,
    graceEnd: Date,
    error: string,
    now: Date,
  ): Promise<void> {
    const orgId = String(contract.org_id);
    const job: NotificationJob = {
      orgId: "system",
      recipientKey: "platform-admin",
      templateId: CONTRACT_RENEWAL_FAILED_ADMIN_TEMPLATE,
      payload: {
        contractId: String(contract._id),
        contractNumber: contract.contract_number,
        orgId,
        attempts,
        gracePeriodEnd: graceEnd.toISOString(),
        error,
        message: `Renewal failed for contract ${contract.contract_number} (org ${orgId}) after ${attempts} attempts. Grace period until ${graceEnd.toISOString().slice(0, 10)}.`,
      },
    };

    await queues.notifications.add(CONTRACT_RENEWAL_FAILED_ADMIN_TEMPLATE, job, {
      jobId: `contract-renewal-failed-admin:${orgId}:${String(contract._id)}:${now.toISOString().slice(0, 10)}`,
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }

  private async enqueueGraceSuspend(
    contract: IContract,
    now: Date,
  ): Promise<void> {
    const orgId = String(contract.org_id);
    const job: NotificationJob = {
      orgId: "system",
      recipientKey: "platform-admin",
      templateId: CONTRACT_RENEWAL_GRACE_SUSPEND_TEMPLATE,
      payload: {
        contractId: String(contract._id),
        contractNumber: contract.contract_number,
        orgId,
        message: `Organization ${orgId} suspended after renewal grace period expired for contract ${contract.contract_number}.`,
      },
    };

    await queues.notifications.add(CONTRACT_RENEWAL_GRACE_SUSPEND_TEMPLATE, job, {
      jobId: `contract-renewal-grace-suspend:${orgId}:${String(contract._id)}:${now.toISOString().slice(0, 10)}`,
      removeOnComplete: true,
      removeOnFail: 100,
    });
  }
}
