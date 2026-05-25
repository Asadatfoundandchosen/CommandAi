import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Coins, Gauge, RefreshCw } from 'lucide-react';

export type AccountBudgetData = {
  account_id: string;
  account_name: string;
  allocated: number;
  available: number;
  used: number;
  limit: number;
  warning_threshold: number;
  percent_used: number;
  warning_active: boolean;
  last_usage: string | null;
  updated_at: string;
};

function formatCredits(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

type Props = {
  /** 24-char hex MongoDB account id */
  accountId: string;
  className?: string;
};

/**
 * Per-account budget dashboard — `GET /api/v1/accounts/:id/budget`.
 * Mount on account detail or portfolio views.
 */
export function AccountBudgetDashboard({ accountId, className = '' }: Props) {
  const [budget, setBudget] = useState<AccountBudgetData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!/^[a-fA-F0-9]{24}$/.test(accountId)) {
      setError('Invalid account id');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/accounts/${accountId}/budget`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to load budget (${res.status})`);
      }
      const json = (await res.json()) as { data: AccountBudgetData };
      setBudget(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load budget');
      setBudget(null);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const usedPct = budget ? Math.min(budget.percent_used, 100) : 0;
  const limitLabel =
    budget && budget.limit > 0 ? formatCredits(budget.limit) : 'No limit';

  return (
    <section
      className={`rounded-xl border border-shell-border bg-shell-surface p-5 ${className}`}
      aria-labelledby="account-budget-heading"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-shell-accent" aria-hidden />
          <h2 id="account-budget-heading" className="text-lg font-semibold text-shell-fg">
            Account budget
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1 text-sm text-shell-muted hover:text-shell-fg disabled:opacity-50"
          aria-label="Refresh budget"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      {loading && !budget && !error && (
        <p className="text-sm text-shell-muted">Loading budget…</p>
      )}

      {budget && (
        <>
          <p className="text-sm text-shell-muted mb-4">
            <span className="font-medium text-shell-fg">{budget.account_name}</span>
            {' · '}
            Credit limit: {limitLabel}
            {' · '}
            Warn at {budget.warning_threshold}% used
          </p>

          {budget.warning_active && (
            <div
              className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
              role="status"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
              <span>
                Usage has reached the warning threshold ({budget.warning_threshold}% of
                allocated credits).
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-lg bg-shell-bg/60 p-3">
              <div className="flex items-center gap-1 text-xs text-shell-muted mb-1">
                <Coins className="h-3 w-3" aria-hidden />
                Allocated
              </div>
              <p className="text-xl font-semibold tabular-nums">
                {formatCredits(budget.allocated)}
              </p>
            </div>
            <div className="rounded-lg bg-shell-bg/60 p-3">
              <p className="text-xs text-shell-muted mb-1">Available</p>
              <p className="text-xl font-semibold tabular-nums text-emerald-400">
                {formatCredits(budget.available)}
              </p>
            </div>
            <div className="rounded-lg bg-shell-bg/60 p-3">
              <p className="text-xs text-shell-muted mb-1">Used (lifetime)</p>
              <p className="text-xl font-semibold tabular-nums">
                {formatCredits(budget.used)}
              </p>
            </div>
          </div>

          <div className="mb-2 flex justify-between text-xs text-shell-muted">
            <span>Usage</span>
            <span>{usedPct.toFixed(1)}% of allocated</span>
          </div>
          <div
            className="h-3 w-full rounded-full bg-shell-bg overflow-hidden"
            role="progressbar"
            aria-valuenow={usedPct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Credits used"
          >
            <div
              className={`h-full rounded-full transition-all ${
                budget.warning_active ? 'bg-amber-500' : 'bg-shell-accent'
              }`}
              style={{ width: `${usedPct}%` }}
            />
          </div>

          {budget.last_usage && (
            <p className="mt-3 text-xs text-shell-muted">
              Last usage: {new Date(budget.last_usage).toLocaleString()}
            </p>
          )}
        </>
      )}
    </section>
  );
}
