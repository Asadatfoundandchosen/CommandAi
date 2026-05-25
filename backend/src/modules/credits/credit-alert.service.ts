import { inject, injectable } from "inversify";
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

import { config } from "@config/index.js";
import { getRedisClient } from "../../infrastructure/cache/redis-client.js";
import { queues } from "../../infrastructure/queue/queues/index.js";
import type { NotificationJob } from "../../infrastructure/queue/queues/notification.queue.js";
import { getRedisEventPublisher } from "../../infrastructure/pubsub/redis-pubsub.js";
import { TYPES } from "../../types.js";
import { ContractRepository } from "../contract/contract.repository.js";
import { OrgSettingsModel } from "../organization/org-settings.model.js";
import { OrganizationRepository } from "../organization/organization.repository.js";
import { sendCreditAlertEmail } from "./credit-alert-email.js";
import {
  CREDIT_ALERT_RESET_BUFFER_PERCENT,
  CREDIT_ALERT_TEMPLATE_ID,
  DEFAULT_ALERT_THRESHOLDS,
  DEFAULT_NOTIFICATION_PREFERENCES,
  ORG_SETTINGS_CREDIT_ALERT_STATE,
  ORG_SETTINGS_CREDIT_ALERT_THRESHOLDS,
  ORG_SETTINGS_NOTIFICATION_PREFERENCES,
  type CreditAlertLevel,
  type CreditAlertState,
  type CreditAlertThreshold,
  type CreditNotificationPreferences,
} from "./credit-alert.constants.js";
import { resolveMostSevereThreshold } from "./credit-alert.logic.js";
import { CreditService } from "./credit.service.js";

export type CreditBalanceSnapshot = {
  balance: number;
  allocationBaseline: number;
  percentRemaining: number;
};

@injectable()
export class CreditAlertService {
  constructor(
    @inject(TYPES.CreditService)
    private readonly credits: CreditService,
    @inject(TYPES.ContractRepository)
    private readonly contracts: ContractRepository,
    @inject(TYPES.OrganizationRepository)
    private readonly organizations: OrganizationRepository,
  ) {}

  /**
   * Evaluate org pool balance vs allocation baseline; alert on lowest crossed threshold.
   * Called after consumption (and optionally on a schedule).
   */
  async checkAndAlert(orgId: string): Promise<{
    alerted: boolean;
    level?: CreditAlertLevel;
    percentRemaining: number;
  }> {
    const snapshot = await this.getBalanceSnapshot(orgId);
    if (!snapshot || snapshot.allocationBaseline <= 0) {
      return { alerted: false, percentRemaining: snapshot?.percentRemaining ?? 100 };
    }

    const thresholds = await this.getThresholdsForOrg(orgId);
    const preferences = await this.getNotificationPreferences(orgId);
    if (!preferences.credit_alerts_enabled) {
      return { alerted: false, percentRemaining: snapshot.percentRemaining };
    }

    const state = await this.getAlertState(orgId);
    const resetBuffer = CREDIT_ALERT_RESET_BUFFER_PERCENT;
    const maxThreshold = Math.max(...thresholds.map((t) => t.percent), 0);
    if (snapshot.percentRemaining > maxThreshold + resetBuffer) {
      if (state.sent_levels.length > 0) {
        await this.saveAlertState(orgId, { sent_levels: [] });
      }
      return { alerted: false, percentRemaining: snapshot.percentRemaining };
    }

    const matched = resolveMostSevereThreshold(
      snapshot.percentRemaining,
      thresholds,
    );
    if (!matched) {
      return { alerted: false, percentRemaining: snapshot.percentRemaining };
    }

    if (state.sent_levels.includes(matched.level)) {
      return { alerted: false, percentRemaining: snapshot.percentRemaining };
    }

    await this.sendAlert(orgId, matched, snapshot, preferences);

    await this.saveAlertState(orgId, {
      sent_levels: [...state.sent_levels, matched.level],
      last_percent_remaining: snapshot.percentRemaining,
      last_checked_at: new Date().toISOString(),
    });

    return {
      alerted: true,
      level: matched.level,
      percentRemaining: snapshot.percentRemaining,
    };
  }

  async getBalanceSnapshot(orgId: string): Promise<CreditBalanceSnapshot | null> {
    const credit = await this.credits.getByOrgId(orgId);
    const contract = await this.contracts.findCurrentActiveForOrg(orgId);
    const org = await this.organizations.findById(orgId);
    if (!org) {
      return null;
    }

    const balance = credit?.balance ?? 0;
    const allocationBaseline =
      contract?.credits.initial_allocation ??
      org.billing?.allocated_credits ??
      balance;

    const percentRemaining =
      allocationBaseline > 0
        ? Math.min(100, (balance / allocationBaseline) * 100)
        : 100;

    return { balance, allocationBaseline, percentRemaining };
  }

  async getThresholdsForOrg(orgId: string): Promise<CreditAlertThreshold[]> {
    const doc = await OrgSettingsModel.findOne({
      org_id: new mongoose.Types.ObjectId(orgId),
      key: ORG_SETTINGS_CREDIT_ALERT_THRESHOLDS,
    }).lean();
    if (!doc?.value || !Array.isArray(doc.value)) {
      return [...DEFAULT_ALERT_THRESHOLDS];
    }
    const parsed = (doc.value as CreditAlertThreshold[])
      .filter(
        (t) =>
          typeof t.percent === "number" &&
          t.percent > 0 &&
          t.percent <= 100 &&
          (t.level === "warning" || t.level === "critical" || t.level === "urgent"),
      )
      .sort((a, b) => b.percent - a.percent);
    return parsed.length > 0 ? parsed : [...DEFAULT_ALERT_THRESHOLDS];
  }

  async getNotificationPreferences(
    orgId: string,
  ): Promise<CreditNotificationPreferences> {
    const doc = await OrgSettingsModel.findOne({
      org_id: new mongoose.Types.ObjectId(orgId),
      key: ORG_SETTINGS_NOTIFICATION_PREFERENCES,
    }).lean();
    if (!doc?.value || typeof doc.value !== "object") {
      return { ...DEFAULT_NOTIFICATION_PREFERENCES };
    }
    const v = doc.value as Partial<CreditNotificationPreferences>;
    return {
      credit_alerts_enabled: v.credit_alerts_enabled ?? true,
      email_enabled: v.email_enabled ?? true,
      in_app_enabled: v.in_app_enabled ?? true,
    };
  }

  async updateAlertSettings(
    orgId: string,
    input: {
      preferences?: Partial<CreditNotificationPreferences>;
      thresholds?: CreditAlertThreshold[];
    },
  ): Promise<{
    preferences: CreditNotificationPreferences;
    thresholds: CreditAlertThreshold[];
  }> {
    const orgObjectId = new mongoose.Types.ObjectId(orgId);

    if (input.preferences) {
      const current = await this.getNotificationPreferences(orgId);
      const merged = { ...current, ...input.preferences };
      await OrgSettingsModel.findOneAndUpdate(
        { org_id: orgObjectId, key: ORG_SETTINGS_NOTIFICATION_PREFERENCES },
        {
          $set: {
            org_id: orgObjectId,
            key: ORG_SETTINGS_NOTIFICATION_PREFERENCES,
            value: merged,
          },
        },
        { upsert: true },
      );
    }

    if (input.thresholds) {
      await OrgSettingsModel.findOneAndUpdate(
        { org_id: orgObjectId, key: ORG_SETTINGS_CREDIT_ALERT_THRESHOLDS },
        {
          $set: {
            org_id: orgObjectId,
            key: ORG_SETTINGS_CREDIT_ALERT_THRESHOLDS,
            value: input.thresholds,
          },
        },
        { upsert: true },
      );
    }

    return {
      preferences: await this.getNotificationPreferences(orgId),
      thresholds: await this.getThresholdsForOrg(orgId),
    };
  }

  /** BullMQ notification worker — deliver email + log in-app delivery. */
  async processNotificationJob(job: NotificationJob): Promise<void> {
    if (job.templateId !== CREDIT_ALERT_TEMPLATE_ID) {
      return;
    }

    const emailTo = typeof job.payload.emailTo === "string" ? job.payload.emailTo : undefined;
    if (emailTo && job.payload.sendEmail === true) {
      await sendCreditAlertEmail({
        to: emailTo,
        orgName: String(job.payload.orgName ?? job.orgId),
        level: String(job.payload.level ?? "warning"),
        percentRemaining: Number(job.payload.percentRemaining ?? 0),
        balance: Number(job.payload.balance ?? 0),
        allocationBaseline: Number(job.payload.allocationBaseline ?? 0),
        message: String(job.payload.message ?? "Low credit balance"),
      });
    }

    process.stdout.write(
      `[credit-alert] delivered org=${job.orgId} level=${String(job.payload.level)} ${String(job.payload.message ?? "")}\n`,
    );
  }

  private async sendAlert(
    orgId: string,
    threshold: CreditAlertThreshold,
    snapshot: CreditBalanceSnapshot,
    preferences: CreditNotificationPreferences,
  ): Promise<void> {
    const org = await this.organizations.findById(orgId);
    const message = `Credit balance is at ${snapshot.percentRemaining.toFixed(1)}% of your allocation (${snapshot.balance.toLocaleString()} of ${snapshot.allocationBaseline.toLocaleString()} credits remaining).`;

    const severity =
      threshold.level === "urgent"
        ? "critical"
        : threshold.level === "critical"
          ? "critical"
          : "warning";

    if (preferences.in_app_enabled && config.pubsub.enabled) {
      const publisher = getRedisEventPublisher(getRedisClient());
      if (publisher) {
        await publisher.publish(orgId, "notifications", {
          id: randomUUID(),
          title: `Credit balance ${threshold.level}`,
          body: message,
          severity,
          meta: {
            level: threshold.level,
            percent_remaining: snapshot.percentRemaining,
            balance: snapshot.balance,
            allocation_baseline: snapshot.allocationBaseline,
          },
        });
      }
    }

    const job: NotificationJob = {
      orgId,
      recipientKey: `org-admin:${orgId}`,
      templateId: CREDIT_ALERT_TEMPLATE_ID,
      payload: {
        level: threshold.level,
        percent: threshold.percent,
        percentRemaining: snapshot.percentRemaining,
        balance: snapshot.balance,
        allocationBaseline: snapshot.allocationBaseline,
        message,
        orgName: org?.name ?? orgId,
        sendEmail: preferences.email_enabled,
        emailTo: preferences.email_enabled ? org?.billing_email : undefined,
      },
    };

    await queues.notifications.add(CREDIT_ALERT_TEMPLATE_ID, job, {
      jobId: `credit-alert:${orgId}:${threshold.level}`,
      removeOnComplete: true,
    });
  }

  private async getAlertState(orgId: string): Promise<CreditAlertState> {
    const doc = await OrgSettingsModel.findOne({
      org_id: new mongoose.Types.ObjectId(orgId),
      key: ORG_SETTINGS_CREDIT_ALERT_STATE,
    }).lean();
    if (!doc?.value || typeof doc.value !== "object") {
      return { sent_levels: [] };
    }
    const v = doc.value as CreditAlertState;
    return {
      sent_levels: Array.isArray(v.sent_levels) ? v.sent_levels : [],
      last_percent_remaining: v.last_percent_remaining,
      last_checked_at: v.last_checked_at,
    };
  }

  private async saveAlertState(orgId: string, state: CreditAlertState): Promise<void> {
    await OrgSettingsModel.findOneAndUpdate(
      {
        org_id: new mongoose.Types.ObjectId(orgId),
        key: ORG_SETTINGS_CREDIT_ALERT_STATE,
      },
      {
        $set: {
          org_id: new mongoose.Types.ObjectId(orgId),
          key: ORG_SETTINGS_CREDIT_ALERT_STATE,
          value: state,
        },
      },
      { upsert: true },
    );
  }
}

export { resolveMostSevereThreshold } from "./credit-alert.logic.js";
