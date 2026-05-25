import { injectable } from "inversify";

import { recordAdminCriticalAction } from "./admin-metrics.js";
import type { AdminEventType } from "./admin-events.js";
import { CRITICAL_ADMIN_EVENTS } from "./admin-events.js";

@injectable()
export class AdminCriticalAlertService {
  async alertIfCritical(
    action: AdminEventType,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!CRITICAL_ADMIN_EVENTS.has(action)) {
      return;
    }
    recordAdminCriticalAction(action);
    process.stderr.write(
      `[ADMIN ALERT] Critical admin action ${action} ${JSON.stringify(payload)}\n`,
    );
  }
}
