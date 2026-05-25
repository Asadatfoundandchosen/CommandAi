import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Coins, RefreshCw, TrendingUp } from 'lucide-react';

import { CreditRateCard } from './CreditRateCard';
import { CreditTransactionHistory } from './CreditTransactionHistory';

type UsageByType = { type: string; amount: number };

type UsageByAccount = {
  account_id: string;
  account_name: string;
  total: number;
  by_type: UsageByType[];
};

type UsageTrendPoint = { date: string; total: number };

type UsageSummary = {
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

function formatCredits(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function BarChart({
  values,
  labels,
  maxValue,
  colorClass = 'bg-shell-accent',
}: {
  values: number[];
  labels: string[];
  maxValue: number;
  colorClass?: string;
}) {
  const max = maxValue > 0 ? maxValue : 1;
  return (
    <div className="flex items-end gap-1 h-32" role="img" aria-label="Usage bar chart">
      {values.map((v, i) => (
        <div key={labels[i] ?? i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div
            className={`w-full rounded-t ${colorClass} transition-all`}
            style={{ height: `${Math.max((v / max) * 100, v > 0 ? 4 : 0)}%` }}
            title={`${labels[i]}: ${formatCredits(v)}`}
          />
          <span className="text-[9px] text-shell-muted truncate w-full text-center">
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Org admin usage dashboard — `GET /api/v1/usage/summary`.
 * Mount on Portfolio Overview or a dedicated `/usage` route.
 */
export function UsageDashboard() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/usage/summary', { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Failed to load usage (${res.status})`);
      }
      const json = (await res.json()) as { data: UsageSummary };
      setSummary(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load usage');
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const usedPct = useMemo(() => {
    if (!summary || summary.credits.allocated <= 0) {
      return 0;
    }
    return Math.min(
      100,
      Math.round((summary.credits.used_this_month / summary.credits.allocated) * 100),
    );
  }, [summary]);

  const trendMax = useMemo(
    () => Math.max(...(summary?.trend.map((t) => t.total) ?? [0]), 1),
    [summary],
  );

  const accountMax = useMemo(
    () => Math.max(...(summary?.usage_by_account.map((a) => a.total) ?? [0]), 1),
    [summary],
  );

  return (
    <div className="space-y-4" aria-label="Credit usage and rates">
      <CreditRateCard />
    <section
      className="rounded-xl border border-shell-border bg-shell-surface p-4 space-y-4"
      aria-label="Credit usage dashboard"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-shell-text">
          <BarChart3 className="w-4 h-4 text-shell-accent" />
          <h3 className="text-body font-medium">Credit usage</h3>
          {summary?.plan && (
            <span className="text-[11px] text-shell-muted capitalize">
              {summary.plan} plan
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="p-1.5 rounded-md text-shell-muted hover:text-shell-text hover:bg-shell-bg"
          aria-label="Refresh usage"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !summary && (
        <p className="text-label text-shell-muted">Loading usage data…</p>
      )}
      {error && (
        <p className="text-label text-red-400" role="alert">
          {error}
        </p>
      )}

      {summary && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-shell-border bg-shell-bg p-3">
              <div className="flex items-center gap-1 text-shell-muted text-label mb-1">
                <Coins className="w-3.5 h-3.5" />
                Allocated
              </div>
              <p className="text-lg text-shell-text font-medium">
                {formatCredits(summary.credits.allocated)}
              </p>
            </div>
            <div className="rounded-lg border border-shell-border bg-shell-bg p-3">
              <p className="text-label text-shell-muted mb-1">Used this month</p>
              <p className="text-lg text-shell-text font-medium">
                {formatCredits(summary.credits.used_this_month)}
              </p>
            </div>
            <div className="rounded-lg border border-shell-border bg-shell-bg p-3">
              <p className="text-label text-shell-muted mb-1">Remaining</p>
              <p className="text-lg text-shell-accent font-medium">
                {formatCredits(summary.credits.remaining)}
              </p>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-label text-shell-muted mb-1">
              <span>Consumption</span>
              <span>{usedPct}% of allocation</span>
            </div>
            <div className="h-2 rounded-full bg-shell-bg overflow-hidden">
              <div
                className="h-full rounded-full bg-shell-accent transition-all"
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </div>

          {summary.trend.length > 0 && (
            <div>
              <div className="flex items-center gap-1 text-label text-shell-muted mb-2">
                <TrendingUp className="w-3.5 h-3.5" />
                Daily trend (last {summary.trend.length} days)
              </div>
              <BarChart
                values={summary.trend.map((t) => t.total)}
                labels={summary.trend.map((t) => t.date.slice(5))}
                maxValue={trendMax}
              />
            </div>
          )}

          <div>
            <p className="text-label text-shell-muted mb-2">Usage by account</p>
            {summary.usage_by_account.length === 0 ? (
              <p className="text-label text-shell-muted">No account usage recorded yet.</p>
            ) : (
              <div className="space-y-3">
                <BarChart
                  values={summary.usage_by_account.map((a) => a.total)}
                  labels={summary.usage_by_account.map((a) =>
                    a.account_name.length > 8
                      ? `${a.account_name.slice(0, 8)}…`
                      : a.account_name,
                  )}
                  maxValue={accountMax}
                  colorClass="bg-blue-500/70"
                />
                <ul className="divide-y divide-shell-border rounded-lg border border-shell-border">
                  {summary.usage_by_account.map((acc) => (
                    <li key={acc.account_id} className="px-3 py-2 text-label">
                      <div className="flex justify-between text-shell-text">
                        <span>{acc.account_name}</span>
                        <span>{formatCredits(acc.total)} credits</span>
                      </div>
                      {acc.by_type.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-shell-muted">
                          {acc.by_type.map((t) => (
                            <span key={`${acc.account_id}-${t.type}`}>
                              {t.type}: {formatCredits(t.amount)}
                            </span>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </section>
      <CreditTransactionHistory />
    </div>
  );
}

export default UsageDashboard;
