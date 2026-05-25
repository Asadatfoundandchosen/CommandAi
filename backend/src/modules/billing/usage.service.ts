import { inject, injectable } from "inversify";

import {
  isTimescaleConnected,
  queryCreditUsageByAccountSince,
  queryCreditUsageTrendDaily,
} from "../../infrastructure/database/index.js";
import { TYPES } from "../../types.js";
import { AccountRepository } from "../account/account.repository.js";
import { ContractRepository } from "../contract/contract.repository.js";
import { OrganizationRepository } from "../organization/organization.repository.js";
import { PlanLimitsValidator } from "../../common/validators/plan-limits.validator.js";
import type { UsageByAccount, UsageSummary, UsageTrendPoint } from "./usage.types.js";

function startOfUtcMonth(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

@injectable()
export class UsageService {
  constructor(
    @inject(TYPES.OrganizationRepository)
    private readonly organizations: OrganizationRepository,
    @inject(TYPES.ContractRepository)
    private readonly contracts: ContractRepository,
    @inject(TYPES.AccountRepository)
    private readonly accounts: AccountRepository,
    @inject(TYPES.PlanLimitsValidator)
    private readonly planLimits: PlanLimitsValidator,
  ) {}

  async getUsageSummary(orgId: string): Promise<UsageSummary | null> {
    const org = await this.organizations.findById(orgId);
    if (!org) {
      return null;
    }

    const periodStart = startOfUtcMonth();
    const contract = await this.contracts.findCurrentActiveForOrg(orgId);
    const tier = await this.planLimits.resolveTier(orgId);

    const plan =
      contract?.billing.plan ?? org.subscription?.tier ?? tier ?? null;

    const allocated =
      org.billing?.allocated_credits ??
      contract?.credits.initial_allocation ??
      0;

    const usageByAccount = await this.buildUsageByAccount(orgId, periodStart);
    const usedThisMonth = usageByAccount.reduce((sum, row) => sum + row.total, 0);

    const usedFromLedger = org.billing?.used_credits ?? 0;
    const used =
      usedThisMonth > 0 ? usedThisMonth : usedFromLedger;

    const remaining = Math.max(allocated - used, 0);
    const trend = await this.getUsageTrend(orgId, 30);

    return {
      plan,
      period_start: periodStart.toISOString(),
      credits: {
        allocated,
        used_this_month: used,
        remaining,
      },
      usage_by_account: usageByAccount,
      trend,
    };
  }

  private async buildUsageByAccount(
    orgId: string,
    periodStart: Date,
  ): Promise<UsageByAccount[]> {
    const accountRows = await this.accounts.listForOrg(orgId);
    const nameById = new Map(
      accountRows.map((a) => [String(a._id), a.name]),
    );

    const byAccount = new Map<string, UsageByAccount>();

    for (const acc of accountRows) {
      const id = String(acc._id);
      byAccount.set(id, {
        account_id: id,
        account_name: acc.name,
        total: 0,
        by_type: [],
      });
    }

    if (isTimescaleConnected()) {
      const raw = await queryCreditUsageByAccountSince(orgId, periodStart);
      for (const row of raw) {
        let entry = byAccount.get(row.account_id);
        if (!entry) {
          entry = {
            account_id: row.account_id,
            account_name: nameById.get(row.account_id) ?? "Unknown account",
            total: 0,
            by_type: [],
          };
          byAccount.set(row.account_id, entry);
        }
        entry.by_type.push({ type: row.usage_type, amount: row.amount });
        entry.total += row.amount;
      }
    }

    return [...byAccount.values()].sort((a, b) => b.total - a.total);
  }

  /** Daily credit usage for the last `days` days (UTC). */
  async getUsageTrend(orgId: string, days = 30): Promise<UsageTrendPoint[]> {
    const to = new Date();
    const from = addDays(to, -days);

    if (!isTimescaleConnected()) {
      return [];
    }

    try {
      const rows = await queryCreditUsageTrendDaily(orgId, from, to);
      return rows.map((r) => ({
        date: r.bucket.toISOString().slice(0, 10),
        total: r.total,
      }));
    } catch (e) {
      process.stderr.write(`[usage] trend query failed: ${String(e)}\n`);
      return [];
    }
  }
}
