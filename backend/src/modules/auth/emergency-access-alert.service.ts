import { injectable } from "inversify";

import { logEmergencyAccess } from "./emergency-access.logger.js";

export type EmergencyAccessAlertPayload = {
  userId: string;
  orgId: string;
  loginMethod: string;
  expiresAt: string;
};

/** Security alert when emergency password/magic-link login is used under SSO enforcement. */
@injectable()
export class EmergencyAccessAlertService {
  async alertEmergencyLogin(payload: EmergencyAccessAlertPayload): Promise<void> {
    logEmergencyAccess("emergency_access_login", {
      user_id: payload.userId,
      org_id: payload.orgId,
      login_method: payload.loginMethod,
      expires_at: payload.expiresAt,
    });
    process.stderr.write(
      `[AUTH ALERT] Emergency access login userId=${payload.userId} orgId=${payload.orgId} method=${payload.loginMethod}\n`,
    );
  }
}
