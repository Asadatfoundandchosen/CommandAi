import { inject, injectable } from "inversify";
import mongoose from "mongoose";

import {
  CREDIT_RATE_LABELS,
  DEFAULT_RATES,
  ORG_SETTINGS_CREDIT_RATES_KEY,
  type CreditRateCard,
  type CreditRateKey,
  getRatesForOrg,
  mergeCreditRates,
} from "../../config/credit-rates.js";
import { TYPES } from "../../types.js";
import { OrgSettingsModel } from "../organization/org-settings.model.js";
import { OrganizationRepository } from "../organization/organization.repository.js";

export type CreditRatesResponse = {
  rates: CreditRateCard;
  labels: typeof CREDIT_RATE_LABELS;
  source: "default" | "custom";
  org_id: string;
};

export type SetOrgCreditRatesInput = Partial<CreditRateCard>;

@injectable()
export class CreditRatesService {
  constructor(
    @inject(TYPES.OrganizationRepository)
    private readonly organizations: OrganizationRepository,
  ) {}

  /** Resolved rate card for an org (enterprise custom rates merged over defaults). */
  async getRatesForOrg(orgId: string): Promise<CreditRatesResponse> {
    const resolved = await getRatesForOrg(orgId);
    return {
      org_id: orgId,
      rates: resolved.rates,
      labels: CREDIT_RATE_LABELS,
      source: resolved.source,
    };
  }

  /** Platform admin: set or replace enterprise custom credit rates for an org. */
  async setCustomRatesForOrg(
    orgId: string,
    input: SetOrgCreditRatesInput,
  ): Promise<CreditRatesResponse> {
    const org = await this.organizations.findById(orgId);
    if (!org) {
      throw new Error(`Organization not found: ${orgId}`);
    }

    const overrides = normalizeRateOverrides(input);
    if (Object.keys(overrides).length === 0) {
      throw new Error("At least one rate override is required");
    }

    const merged = mergeCreditRates(DEFAULT_RATES, overrides);
    await OrgSettingsModel.findOneAndUpdate(
      {
        org_id: new mongoose.Types.ObjectId(orgId),
        key: ORG_SETTINGS_CREDIT_RATES_KEY,
      },
      {
        $set: {
          org_id: new mongoose.Types.ObjectId(orgId),
          key: ORG_SETTINGS_CREDIT_RATES_KEY,
          value: overrides,
        },
      },
      { upsert: true, new: true },
    );

    return {
      org_id: orgId,
      rates: merged,
      labels: CREDIT_RATE_LABELS,
      source: "custom",
    };
  }

  /** Platform admin: remove custom rates (revert to platform defaults). */
  async clearCustomRatesForOrg(orgId: string): Promise<CreditRatesResponse> {
    await OrgSettingsModel.deleteOne({
      org_id: new mongoose.Types.ObjectId(orgId),
      key: ORG_SETTINGS_CREDIT_RATES_KEY,
    });
    return {
      org_id: orgId,
      rates: { ...DEFAULT_RATES },
      labels: CREDIT_RATE_LABELS,
      source: "default",
    };
  }
}

function normalizeRateOverrides(
  input: SetOrgCreditRatesInput,
): Partial<CreditRateCard> {
  const out: Partial<CreditRateCard> = {};
  for (const key of Object.keys(DEFAULT_RATES) as CreditRateKey[]) {
    const raw = input[key];
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
      continue;
    }
    out[key] = Math.round(raw);
  }
  return out;
}
