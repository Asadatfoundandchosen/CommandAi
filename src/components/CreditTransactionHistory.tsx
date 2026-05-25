import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  Download,
  FileText,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';

type TransactionRow = {
  id: string;
  account_id: string | null;
  account_name: string | null;
  type: string;
  amount: number;
  balance_after: number;
  reference_type: string;
  description: string;
  created_at: string;
};

type TypeSummary = { type: string; count: number; total_amount: number };
type DailySummary = {
  date: string;
  count: number;
  net_amount: number;
  credits_in: number;
  credits_out: number;
};

type HistoryResponse = {
  items: TransactionRow[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    has_more: boolean;
  };
  summary: {
    total_count: number;
    net_amount: number;
    credits_in: number;
    credits_out: number;
    by_type: TypeSummary[];
    daily: DailySummary[];
  };
};

const TRANSACTION_TYPES = [
  '',
  'purchase',
  'allocation',
  'consumption',
  'refund',
  'expiry',
] as const;

function formatCredits(n: number): string {
  const prefix = n > 0 ? '+' : '';
  return `${prefix}${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function MiniBarChart({
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
    <div className="flex items-end gap-1 h-24" role="img" aria-label="Chart">
      {values.map((v, i) => (
        <div key={labels[i] ?? i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div
            className={`w-full rounded-t ${colorClass}`}
            style={{ height: `${Math.max((v / max) * 100, v > 0 ? 4 : 0)}%` }}
            title={`${labels[i]}: ${v}`}
          />
          <span className="text-[9px] text-shell-muted truncate w-full text-center">
            {labels[i]}
          </span>
        </div>
      ))}
    </div>
  );
}

function buildQueryParams(filters: {
  account_id: string;
  type: string;
  from: string;
  to: string;
  limit: number;
  offset: number;
}): string {
  const params = new URLSearchParams();
  if (filters.account_id.trim()) {
    params.set('account_id', filters.account_id.trim());
  }
  if (filters.type) {
    params.set('type', filters.type);
  }
  if (filters.from) {
    params.set('from', new Date(filters.from).toISOString());
  }
  if (filters.to) {
    params.set('to', new Date(filters.to).toISOString());
  }
  params.set('limit', String(filters.limit));
  params.set('offset', String(filters.offset));
  return params.toString();
}

/**
 * Credit transaction audit trail — `GET /api/v1/credits/transactions` + CSV export.
 */
export function CreditTransactionHistory() {
  const [filters, setFilters] = useState({
    account_id: '',
    type: '',
    from: '',
    to: '',
    limit: 50,
    offset: 0,
  });
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = buildQueryParams(filters);
      const res = await fetch(`/api/v1/credits/transactions?${qs}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to load transactions (${res.status})`);
      }
      const json = (await res.json()) as { data: HistoryResponse };
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load transactions');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const dailyMax = useMemo(
    () => Math.max(...(data?.summary.daily.map((d) => Math.abs(d.net_amount)) ?? [0]), 1),
    [data],
  );

  const typeMax = useMemo(
    () =>
      Math.max(
        ...(data?.summary.by_type.map((t) => Math.abs(t.total_amount)) ?? [0]),
        1,
      ),
    [data],
  );

  const exportUrl = `/api/v1/credits/transactions/export?${buildQueryParams({
    ...filters,
    offset: 0,
  })}`;

  return (
    <section
      className="rounded-xl border border-shell-border bg-shell-surface p-4 space-y-4"
      aria-label="Credit transaction history"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-shell-text">
          <FileText className="w-4 h-4 text-shell-accent" />
          <h3 className="text-body font-medium">Credit transaction history</h3>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={exportUrl}
            className="inline-flex items-center gap-1 text-label px-2 py-1 rounded-md border border-shell-border hover:bg-shell-bg text-shell-muted hover:text-shell-text"
            download
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </a>
          <button
            type="button"
            onClick={() => void load()}
            className="p-1.5 rounded-md text-shell-muted hover:text-shell-text hover:bg-shell-bg"
            aria-label="Refresh transactions"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-label">
        <label className="flex flex-col gap-1 text-shell-muted">
          Account ID
          <input
            type="text"
            value={filters.account_id}
            onChange={(e) =>
              setFilters((f) => ({ ...f, account_id: e.target.value, offset: 0 }))
            }
            placeholder="24-char hex (optional)"
            className="rounded-md border border-shell-border bg-shell-bg px-2 py-1 text-shell-text"
          />
        </label>
        <label className="flex flex-col gap-1 text-shell-muted">
          Type
          <select
            value={filters.type}
            onChange={(e) =>
              setFilters((f) => ({ ...f, type: e.target.value, offset: 0 }))
            }
            className="rounded-md border border-shell-border bg-shell-bg px-2 py-1 text-shell-text"
          >
            {TRANSACTION_TYPES.map((t) => (
              <option key={t || 'all'} value={t}>
                {t || 'All types'}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-shell-muted">
          From
          <input
            type="date"
            value={filters.from}
            onChange={(e) =>
              setFilters((f) => ({ ...f, from: e.target.value, offset: 0 }))
            }
            className="rounded-md border border-shell-border bg-shell-bg px-2 py-1 text-shell-text"
          />
        </label>
        <label className="flex flex-col gap-1 text-shell-muted">
          To
          <input
            type="date"
            value={filters.to}
            onChange={(e) =>
              setFilters((f) => ({ ...f, to: e.target.value, offset: 0 }))
            }
            className="rounded-md border border-shell-border bg-shell-bg px-2 py-1 text-shell-text"
          />
        </label>
      </div>

      {error && (
        <p className="text-label text-red-400" role="alert">
          {error}
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-shell-border bg-shell-bg p-3">
              <p className="text-label text-shell-muted mb-1">Transactions</p>
              <p className="text-lg font-medium">{data.summary.total_count}</p>
            </div>
            <div className="rounded-lg border border-shell-border bg-shell-bg p-3">
              <p className="text-label text-shell-muted mb-1 flex items-center gap-1">
                <ArrowUpCircle className="w-3 h-3 text-emerald-400" />
                Credits in
              </p>
              <p className="text-lg font-medium text-emerald-400">
                {formatCredits(data.summary.credits_in)}
              </p>
            </div>
            <div className="rounded-lg border border-shell-border bg-shell-bg p-3">
              <p className="text-label text-shell-muted mb-1 flex items-center gap-1">
                <ArrowDownCircle className="w-3 h-3 text-amber-400" />
                Credits out
              </p>
              <p className="text-lg font-medium text-amber-400">
                {formatCredits(-data.summary.credits_out)}
              </p>
            </div>
            <div className="rounded-lg border border-shell-border bg-shell-bg p-3">
              <p className="text-label text-shell-muted mb-1">Net movement</p>
              <p className="text-lg font-medium">{formatCredits(data.summary.net_amount)}</p>
            </div>
          </div>

          {data.summary.by_type.length > 0 && (
            <div>
              <p className="text-label text-shell-muted mb-2">By type</p>
              <MiniBarChart
                values={data.summary.by_type.map((t) => Math.abs(t.total_amount))}
                labels={data.summary.by_type.map((t) => t.type)}
                maxValue={typeMax}
                colorClass="bg-violet-500/70"
              />
            </div>
          )}

          {data.summary.daily.length > 0 && (
            <div>
              <div className="flex items-center gap-1 text-label text-shell-muted mb-2">
                <TrendingUp className="w-3.5 h-3.5" />
                Daily net movement
              </div>
              <MiniBarChart
                values={data.summary.daily.map((d) => Math.abs(d.net_amount))}
                labels={data.summary.daily.map((d) => d.date.slice(5))}
                maxValue={dailyMax}
              />
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border border-shell-border">
            <table className="w-full text-label">
              <thead className="bg-shell-bg text-shell-muted">
                <tr>
                  <th className="text-left px-3 py-2">Date</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-right px-3 py-2">Amount</th>
                  <th className="text-right px-3 py-2">Balance after</th>
                  <th className="text-left px-3 py-2">Account</th>
                  <th className="text-left px-3 py-2">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-shell-border">
                {data.items.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-shell-muted text-center">
                      No transactions match these filters.
                    </td>
                  </tr>
                ) : (
                  data.items.map((row) => (
                    <tr key={row.id} className="text-shell-text">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Date(row.created_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 capitalize">{row.type}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          row.amount >= 0 ? 'text-emerald-400' : 'text-amber-400'
                        }`}
                      >
                        {formatCredits(row.amount)}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.balance_after.toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        {row.account_name ?? row.account_id ?? '—'}
                      </td>
                      <td className="px-3 py-2 max-w-xs truncate" title={row.description}>
                        {row.description}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-label text-shell-muted">
            <span>
              Showing {data.pagination.offset + 1}–
              {data.pagination.offset + data.items.length} of {data.pagination.total}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={data.pagination.offset === 0 || loading}
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    offset: Math.max(0, f.offset - f.limit),
                  }))
                }
                className="px-2 py-1 rounded border border-shell-border disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={!data.pagination.has_more || loading}
                onClick={() =>
                  setFilters((f) => ({ ...f, offset: f.offset + f.limit }))
                }
                className="px-2 py-1 rounded border border-shell-border disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {loading && !data && !error && (
        <p className="text-label text-shell-muted">Loading transaction history…</p>
      )}
    </section>
  );
}

export default CreditTransactionHistory;
