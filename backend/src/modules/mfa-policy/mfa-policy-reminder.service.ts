import { inject, injectable } from "inversify";

import { getRedisClient } from "../../infrastructure/cache/redis-client.js";
import type { NotificationJob } from "../../infrastructure/queue/queues/notification.queue.js";

import {
  MFA_POLICY_DAILY_REMINDER_JOB,
  MFA_REMINDER_REDIS_PREFIX,
} from "./mfa-policy.constants.js";
import { sendMfaPolicyReminderEmail } from "./mfa-policy-reminder.email.js";
import { gracePeriodEnd } from "./mfa-policy.logic.js";
import { MfaPolicyService } from "./mfa-policy.service.js";

function reminderSentKey(userId: string, utcDay: string): string {
  return `${MFA_REMINDER_REDIS_PREFIX}${userId}:${utcDay}`;
}

function utcDayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

@injectable()
export class MfaPolicyReminderService {
  constructor(
    @inject(MfaPolicyService) private readonly policies: MfaPolicyService,
  ) {}

  async processDailyReminderJob(job: NotificationJob): Promise<void> {
    if (job.payload?.type !== MFA_POLICY_DAILY_REMINDER_JOB) {
      return;
    }

    const redis = getRedisClient();
    const day = utcDayKey();
    const pending = await this.policies.listUsersNeedingMfaDuringGrace();

    let sent = 0;
    let skipped = 0;

    for (const { user, policy, orgName, daysRemaining } of pending) {
      const userId = String(user._id);
      if (redis) {
        const key = reminderSentKey(userId, day);
        const already = await redis.get(key);
        if (already) {
          skipped += 1;
          continue;
        }
      }

      const emailed = await sendMfaPolicyReminderEmail({
        to: user.email,
        orgName,
        daysRemaining,
        gracePeriodEnd: gracePeriodEnd(
          policy.enforcement_date,
          policy.grace_period_days,
        ),
        requiredFor: policy.required_for,
      });

      if (emailed && redis) {
        await redis.set(reminderSentKey(userId, day), "1", "EX", 86_400);
        sent += 1;
      }
    }

    process.stdout.write(
      `[mfa-policy] daily reminder scan sent=${sent} skipped=${skipped} pending=${pending.length}\n`,
    );
  }
}
