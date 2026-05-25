import type {
  BillingCycle,
  BillingPlan,
  ContractStatus,
  ContractType,
  IContract,
} from "./contract.model.js";

/** Org-admin read model (no platform-only fields such as `internal_notes`). */
export type ContractCreditAllocation = {
  initial: number;
  renewal: number;
};

export type ContractRenewalTerms = {
  auto_renew: boolean;
  billing_cycle: BillingCycle;
  renewal_allocation: number;
};

export type ContractExpiryAlertLevel = "none" | "info" | "warning" | "critical" | "expired";

export type ContractDetailView = {
  id: string;
  contract_number: string;
  status: ContractStatus;
  plan_type: BillingPlan;
  contract_type: ContractType;
  start_date: string;
  end_date: string;
  credit_allocation: ContractCreditAllocation;
  auto_renewal: boolean;
  renewal_terms: ContractRenewalTerms;
  days_until_renewal: number | null;
  days_until_expiry: number;
  expiry_alert: ContractExpiryAlertLevel;
};

export type ContractExpiryNotification = {
  type: "contract_expiry";
  severity: ContractExpiryAlertLevel;
  days_remaining: number;
  message: string;
  contract_id: string;
  contract_number: string;
};

const MS_PER_DAY = 86_400_000;

/** Whole calendar days from now (UTC) until `target` (ceil). */
export function daysUntilDate(target: Date, now: Date = new Date()): number {
  const end = Date.UTC(
    target.getUTCFullYear(),
    target.getUTCMonth(),
    target.getUTCDate(),
  );
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.ceil((end - start) / MS_PER_DAY);
}

export function resolveExpiryAlertLevel(daysUntilExpiry: number): ContractExpiryAlertLevel {
  if (daysUntilExpiry < 0) {
    return "expired";
  }
  if (daysUntilExpiry <= 7) {
    return "critical";
  }
  if (daysUntilExpiry <= 14) {
    return "warning";
  }
  if (daysUntilExpiry <= 30) {
    return "info";
  }
  return "none";
}

export function toContractDetailView(contract: IContract, now: Date = new Date()): ContractDetailView {
  const daysUntilExpiry = daysUntilDate(contract.end_date, now);
  const daysUntilRenewal = contract.auto_renew ? daysUntilExpiry : null;

  return {
    id: String(contract._id),
    contract_number: contract.contract_number,
    status: contract.status,
    plan_type: contract.billing.plan,
    contract_type: contract.type,
    start_date: contract.start_date.toISOString(),
    end_date: contract.end_date.toISOString(),
    credit_allocation: {
      initial: contract.credits.initial_allocation,
      renewal: contract.credits.renewal_allocation,
    },
    auto_renewal: contract.auto_renew,
    renewal_terms: {
      auto_renew: contract.auto_renew,
      billing_cycle: contract.billing.billing_cycle,
      renewal_allocation: contract.credits.renewal_allocation,
    },
    days_until_renewal: daysUntilRenewal,
    days_until_expiry: daysUntilExpiry,
    expiry_alert: resolveExpiryAlertLevel(daysUntilExpiry),
  };
}

/** Thresholds (days) for in-app expiry banners and scheduled notification enqueue. */
export const CONTRACT_EXPIRY_NOTIFY_DAYS = [30, 14, 7, 1] as const;

export function buildExpiryNotifications(
  contract: IContract,
  now: Date = new Date(),
): ContractExpiryNotification[] {
  const daysRemaining = daysUntilDate(contract.end_date, now);
  const severity = resolveExpiryAlertLevel(daysRemaining);
  if (severity === "none") {
    return [];
  }

  const shouldNotify =
    daysRemaining < 0 ||
    (CONTRACT_EXPIRY_NOTIFY_DAYS as readonly number[]).includes(daysRemaining);

  if (!shouldNotify) {
    return [];
  }

  const renewalHint = contract.auto_renew
    ? " Your contract is set to auto-renew."
    : " Contact your account manager to renew.";

  let message: string;
  if (daysRemaining < 0) {
    message = `Contract ${contract.contract_number} expired on ${contract.end_date.toISOString().slice(0, 10)}.${renewalHint}`;
  } else if (daysRemaining === 0) {
    message = `Contract ${contract.contract_number} ends today.${renewalHint}`;
  } else {
    message = `Contract ${contract.contract_number} ends in ${daysRemaining} day${daysRemaining === 1 ? "" : "s"}.${renewalHint}`;
  }

  return [
    {
      type: "contract_expiry",
      severity,
      days_remaining: daysRemaining,
      message,
      contract_id: String(contract._id),
      contract_number: contract.contract_number,
    },
  ];
}

export type CurrentContractResponse = {
  data: ContractDetailView | null;
  expiry_notifications: ContractExpiryNotification[];
};

export function toCurrentContractResponse(
  contract: IContract | null,
  now: Date = new Date(),
): CurrentContractResponse {
  if (!contract) {
    return { data: null, expiry_notifications: [] };
  }
  return {
    data: toContractDetailView(contract, now),
    expiry_notifications: buildExpiryNotifications(contract, now),
  };
}
