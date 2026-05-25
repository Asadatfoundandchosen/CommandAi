import { injectable } from "inversify";
import mongoose from "mongoose";

import type { IUser } from "@modules/user/user.model.js";
import { UserModel } from "@modules/user/user.model.js";

import { logEmergencyAccess } from "./emergency-access.logger.js";

export const DEFAULT_EMERGENCY_ACCESS_TTL_HOURS = 24;

@injectable()
export class EmergencyAccessService {
  isEmergencyAccessActive(user: IUser): boolean {
    if (!user.emergency_access_expires_at) {
      return false;
    }
    return user.emergency_access_expires_at.getTime() > Date.now();
  }

  async grantEmergencyAccess(
    orgId: string,
    userId: string,
    grantedByUserId: string,
    ttlHours = DEFAULT_EMERGENCY_ACCESS_TTL_HOURS,
  ): Promise<{ user_id: string; expires_at: string }> {
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const user = await UserModel.findOneAndUpdate(
      {
        _id: userId,
        org_id: orgId,
        is_deleted: false,
      },
      {
        $set: {
          emergency_access_expires_at: expiresAt,
          emergency_access_granted_by: new mongoose.Types.ObjectId(grantedByUserId),
          emergency_access_granted_at: new Date(),
        },
      },
      { new: true },
    ).lean<IUser | null>();

    if (!user) {
      throw new Error("User not found in organization");
    }

    logEmergencyAccess("emergency_access_granted", {
      user_id: userId,
      org_id: orgId,
      granted_by: grantedByUserId,
      expires_at: expiresAt.toISOString(),
      ttl_hours: ttlHours,
    });

    return {
      user_id: userId,
      expires_at: expiresAt.toISOString(),
    };
  }

  async revokeEmergencyAccess(orgId: string, userId: string): Promise<void> {
    const result = await UserModel.updateOne(
      { _id: userId, org_id: orgId, is_deleted: false },
      {
        $unset: {
          emergency_access_expires_at: "",
          emergency_access_granted_by: "",
          emergency_access_granted_at: "",
        },
      },
    );

    if (result.matchedCount === 0) {
      throw new Error("User not found in organization");
    }

    logEmergencyAccess("emergency_access_revoked", {
      user_id: userId,
      org_id: orgId,
    });
  }
}
