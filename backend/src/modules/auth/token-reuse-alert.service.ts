import { injectable } from "inversify";

import { recordRefreshTokenReuse } from "./auth-metrics.js";

export type TokenReuseAlertPayload = {
  userId: string;
  orgId: string;
  jti: string;
};

/**
 * Security alert when a consumed refresh token is presented again.
 * Wire to PagerDuty / Slack in production (same hook pattern as DLQ alerts).
 */
@injectable()
export class TokenReuseAlertService {
  async alertReuse(payload: TokenReuseAlertPayload): Promise<void> {
    recordRefreshTokenReuse();
    process.stderr.write(
      `[AUTH ALERT] Refresh token reuse detected (potential theft) userId=${payload.userId} orgId=${payload.orgId} jti=${payload.jti}\n`,
    );
  }
}
