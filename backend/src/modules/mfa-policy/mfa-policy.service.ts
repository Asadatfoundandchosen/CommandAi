import { injectable } from "inversify";
import type { Types } from "mongoose";

import type { IUser } from "@modules/user/user.model.js";
import { UserModel } from "@modules/user/user.model.js";
import { OrganizationModel } from "@modules/organization/organization.model.js";

import {
  DEFAULT_ALLOWED_METHODS,
  daysRemainingUntil,
  gracePeriodEnd,
  isEnforcementBlocking,
  isGracePeriodActive,
  roleRequiresMfaPolicy,
  userSatisfiesMfaPolicy,
} from "./mfa-policy.logic.js";
import type { IMFAPolicy, MfaAllowedMethod, MfaRequiredFor } from "./mfa-policy.model.js";
import { MfaPolicyModel } from "./mfa-policy.model.js";

export type MfaPolicyView = {
  org_id: string;
  enabled: boolean;
  required_for: MfaRequiredFor;
  grace_period_days: number;
  allowed_methods: MfaAllowedMethod[];
  enforcement_date: string;
  grace_period_end: string;
  days_remaining: number;
  enforcement_active: boolean;
};

export type UpsertMfaPolicyInput = {
  enabled: boolean;
  required_for: MfaRequiredFor;
  grace_period_days: number;
  allowed_methods: MfaAllowedMethod[];
  enforcement_date?: Date;
};

export type MfaEnforcementEvaluation = {
  blocked: boolean;
  in_grace_period: boolean;
  grace_period_end?: Date;
  days_remaining?: number;
  setup_url: string;
};

@injectable()
export class MfaPolicyService {
  async getPolicyForOrg(orgId: string): Promise<MfaPolicyView | null> {
    const doc = await MfaPolicyModel.findOne({ org_id: orgId }).lean<IMFAPolicy | null>();
    if (!doc) {
      return null;
    }
    return this.toView(doc);
  }

  async upsertPolicy(orgId: string, input: UpsertMfaPolicyInput): Promise<MfaPolicyView> {
    const enforcementDate = input.enforcement_date ?? new Date();
    const doc = await MfaPolicyModel.findOneAndUpdate(
      { org_id: orgId },
      {
        $set: {
          enabled: input.enabled,
          required_for: input.required_for,
          grace_period_days: input.grace_period_days,
          allowed_methods: input.allowed_methods,
          enforcement_date: enforcementDate,
        },
        $setOnInsert: { org_id: orgId },
      },
      { upsert: true, new: true },
    ).lean<IMFAPolicy | null>();

    if (!doc) {
      throw new Error("Failed to persist MFA policy");
    }

    return this.toView(doc);
  }

  async evaluateForUser(
    orgId: string,
    userId: string,
    role: string,
    setupPath: string,
  ): Promise<MfaEnforcementEvaluation | null> {
    const policy = await MfaPolicyModel.findOne({
      org_id: orgId,
      enabled: true,
    }).lean<IMFAPolicy | null>();

    if (!policy || policy.required_for === "none") {
      return null;
    }

    if (!roleRequiresMfaPolicy(role, policy.required_for)) {
      return null;
    }

    const user = await UserModel.findOne({
      _id: userId,
      org_id: orgId,
      is_deleted: false,
    })
      .select("mfa_enabled mfa.sms_enabled")
      .lean<IUser | null>();

    if (!user) {
      return null;
    }

    if (userSatisfiesMfaPolicy(user, policy.allowed_methods)) {
      return null;
    }

    const end = gracePeriodEnd(policy.enforcement_date, policy.grace_period_days);
    const now = new Date();
    const inGrace = isGracePeriodActive(
      policy.enforcement_date,
      policy.grace_period_days,
      now,
    );
    const blocked = isEnforcementBlocking(
      policy.enforcement_date,
      policy.grace_period_days,
      now,
    );

    return {
      blocked,
      in_grace_period: inGrace,
      grace_period_end: end,
      days_remaining: daysRemainingUntil(end, now),
      setup_url: setupPath,
    };
  }

  /** Users in scope who still need MFA during the grace window. */
  async listUsersNeedingMfaDuringGrace(): Promise<
    Array<{
      user: IUser;
      policy: IMFAPolicy;
      orgName: string;
      daysRemaining: number;
    }>
  > {
    const policies = await MfaPolicyModel.find({
      enabled: true,
      required_for: { $ne: "none" },
    }).lean<IMFAPolicy[]>();

    const now = new Date();
    const results: Array<{
      user: IUser;
      policy: IMFAPolicy;
      orgName: string;
      daysRemaining: number;
    }> = [];

    for (const policy of policies) {
      if (
        !isGracePeriodActive(policy.enforcement_date, policy.grace_period_days, now)
      ) {
        continue;
      }

      const org = await OrganizationModel.findById(policy.org_id)
        .select("name")
        .lean<{ name: string } | null>();
      const orgName = org?.name ?? "your organization";

      const roleFilter =
        policy.required_for === "all"
          ? {}
          : { role: { $in: ["org_admin", "account_admin"] as IUser["role"][] } };

      const users = await UserModel.find({
        org_id: policy.org_id,
        is_deleted: false,
        status: "active",
        ...roleFilter,
      })
        .select("email first_name mfa_enabled mfa.sms_enabled org_id")
        .lean<IUser[]>();

      const end = gracePeriodEnd(policy.enforcement_date, policy.grace_period_days);
      const daysRemaining = daysRemainingUntil(end, now);

      for (const user of users) {
        if (!userSatisfiesMfaPolicy(user, policy.allowed_methods)) {
          results.push({ user, policy, orgName, daysRemaining });
        }
      }
    }

    return results;
  }

  private toView(doc: IMFAPolicy): MfaPolicyView {
    const end = gracePeriodEnd(doc.enforcement_date, doc.grace_period_days);
    const now = new Date();
    return {
      org_id: String(doc.org_id),
      enabled: doc.enabled,
      required_for: doc.required_for,
      grace_period_days: doc.grace_period_days,
      allowed_methods: doc.allowed_methods.length
        ? doc.allowed_methods
        : [...DEFAULT_ALLOWED_METHODS],
      enforcement_date: doc.enforcement_date.toISOString(),
      grace_period_end: end.toISOString(),
      days_remaining: daysRemainingUntil(end, now),
      enforcement_active:
        doc.enabled &&
        doc.required_for !== "none" &&
        isEnforcementBlocking(doc.enforcement_date, doc.grace_period_days, now),
    };
  }
}
