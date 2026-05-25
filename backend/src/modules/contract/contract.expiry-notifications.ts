import { inject, injectable } from "inversify";

import { queues } from "../../infrastructure/queue/queues/index.js";
import type { NotificationJob } from "../../infrastructure/queue/queues/notification.queue.js";
import { TYPES } from "../../types.js";
import {
  CONTRACT_EXPIRY_NOTIFY_DAYS,
  buildExpiryNotifications,
  daysUntilDate,
} from "./contract.dto.js";
import type { IContract } from "./contract.model.js";
import { ContractRepository } from "./contract.repository.js";

export const CONTRACT_EXPIRY_DAILY_SCAN_JOB = "contract-expiry-daily-scan";
export const CONTRACT_EXPIRY_TEMPLATE_ID = "contract-expiry";

@injectable()
export class ContractExpiryNotificationService {
  constructor(
    @inject(TYPES.ContractRepository)
    private readonly contracts: ContractRepository,
  ) {}

  /**
   * Daily scan: enqueue one notification job per active contract at expiry thresholds.
   */
  async runDailyExpiryScan(now: Date = new Date()): Promise<number> {
    const active = await this.contracts.listAllActive();
    let enqueued = 0;

    for (const contract of active) {
      const daysRemaining = daysUntilDate(contract.end_date, now);
      if (
        daysRemaining < 0 ||
        !(CONTRACT_EXPIRY_NOTIFY_DAYS as readonly number[]).includes(daysRemaining)
      ) {
        continue;
      }

      const notifications = buildExpiryNotifications(contract, now);
      const primary = notifications[0];
      if (!primary) {
        continue;
      }

      const orgId = String(contract.org_id);
      const job: NotificationJob = {
        orgId,
        recipientKey: `org-admin:${orgId}`,
        templateId: CONTRACT_EXPIRY_TEMPLATE_ID,
        payload: {
          contractId: String(contract._id),
          contractNumber: contract.contract_number,
          daysRemaining: primary.days_remaining,
          severity: primary.severity,
          message: primary.message,
          endDate: contract.end_date.toISOString(),
          autoRenew: contract.auto_renew,
        },
      };

      await queues.notifications.add(CONTRACT_EXPIRY_TEMPLATE_ID, job, {
        jobId: `contract-expiry:${orgId}:${String(contract._id)}:${daysRemaining}`,
        removeOnComplete: true,
        removeOnFail: 100,
      });
      enqueued += 1;
    }

    return enqueued;
  }

  /** Notification worker handler for contract expiry jobs. */
  async processNotificationJob(job: NotificationJob): Promise<void> {
    if (job.templateId === CONTRACT_EXPIRY_DAILY_SCAN_JOB) {
      const count = await this.runDailyExpiryScan();
      process.stdout.write(
        `[contract-expiry] daily scan enqueued ${count} notification(s)\n`,
      );
      return;
    }

    if (job.templateId === CONTRACT_EXPIRY_TEMPLATE_ID) {
      process.stdout.write(
        `[contract-expiry] org=${job.orgId} contract=${String(job.payload.contractNumber ?? "")} days=${String(job.payload.daysRemaining ?? "")} — ${String(job.payload.message ?? "")}\n`,
      );
    }
  }
}
