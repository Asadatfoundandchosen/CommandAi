import { injectable } from "inversify";

import { recordAccountLockout } from "./auth-metrics.js";

export type LockoutAlertPayload = {
  userId: string;
  attempts: number;
  durationSec: number;
};

/**
 * Security alert when brute-force lockout triggers (progressive tiers).
 * Wire to PagerDuty / Slack in production (same hook pattern as DLQ alerts).
 */
@injectable()
export class LockoutAlertService {
  async alertLockout(payload: LockoutAlertPayload): Promise<void> {
    recordAccountLockout();
    process.stderr.write(
      `[AUTH ALERT] Account lockout userId=${payload.userId} attempts=${payload.attempts} durationSec=${payload.durationSec}\n`,
    );
  }
}
