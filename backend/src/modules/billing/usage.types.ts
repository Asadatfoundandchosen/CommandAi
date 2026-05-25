export type CreditUsageByType = {
  type: string;
  amount: number;
};

export type UsageByAccount = {
  account_id: string;
  account_name: string;
  total: number;
  by_type: CreditUsageByType[];
};

export type UsageTrendPoint = {
  date: string;
  total: number;
};

export type UsageSummary = {
  plan: string | null;
  period_start: string;
  credits: {
    allocated: number;
    used_this_month: number;
    remaining: number;
  };
  usage_by_account: UsageByAccount[];
  trend: UsageTrendPoint[];
};
