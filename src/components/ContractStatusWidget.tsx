import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, FileText, RefreshCw } from 'lucide-react';

type ExpiryAlertLevel = 'none' | 'info' | 'warning' | 'critical' | 'expired';

type ContractDetail = {
  id: string;
  contract_number: string;
  status: string;
  plan_type: string;
  contract_type: string;
  start_date: string;
  end_date: string;
  credit_allocation: { initial: number; renewal: number };
  auto_renewal: boolean;
  renewal_terms: {
    auto_renew: boolean;
    billing_cycle: string;
    renewal_allocation: number;
  };
  days_until_renewal: number | null;
  days_until_expiry: number;
  expiry_alert: ExpiryAlertLevel;
};

type ExpiryNotification = {
  type: string;
  severity: ExpiryAlertLevel;
  days_remaining: number;
  message: string;
};

type CurrentContractPayload = {
  data: ContractDetail | null;
  expiry_notifications: ExpiryNotification[];
};

const alertStyles: Record<ExpiryAlertLevel, string> = {
  none: 'bg-shell-surface text-shell-muted border-shell-border',
  info: 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  warning: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  critical: 'bg-orange-500/10 text-orange-300 border-orange-500/30',
  expired: 'bg-red-500/10 text-red-300 border-red-500/30',
};

const statusLabel: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  expired: 'Expired',
  terminated: 'Terminated',
};

/**
 * Dashboard widget: active contract terms for org admins (`GET /api/v1/contracts/current`).
 */
export function ContractStatusWidget() {
  const [payload, setPayload] = useState<CurrentContractPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/contracts/current', { credentials: 'include' });
      if (res.status === 404) {
        setPayload({ data: null, expiry_notifications: [] });
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to load contract (${res.status})`);
      }
      const json = (await res.json()) as CurrentContractPayload;
      setPayload(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load contract');
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const contract = payload?.data;
  const notifications = payload?.expiry_notifications ?? [];
  const alert = contract?.expiry_alert ?? 'none';

  return (
    <section
      className="rounded-xl border border-shell-border bg-shell-surface p-4"
      aria-label="Contract status"
    >
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-shell-text">
          <FileText className="w-4 h-4 text-shell-accent" />
          <h3 className="text-body font-medium">Agreement with 1CommandAI</h3>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="p-1.5 rounded-md text-shell-muted hover:text-shell-text hover:bg-shell-bg"
          aria-label="Refresh contract"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {loading && !contract && (
        <p className="text-label text-shell-muted">Loading contract terms…</p>
      )}

      {error && (
        <p className="text-label text-red-400" role="alert">
          {error}
        </p>
      )}

      {!loading && !error && !contract && (
        <p className="text-label text-shell-muted">No active contract on file for your organization.</p>
      )}

      {contract && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-label text-shell-muted">{contract.contract_number}</span>
            <span
              className={`text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${alertStyles[alert]}`}
            >
              {statusLabel[contract.status] ?? contract.status}
            </span>
            <span className="text-[11px] text-shell-muted capitalize">{contract.plan_type} plan</span>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-label">
            <div>
              <dt className="text-shell-muted">Term</dt>
              <dd className="text-shell-text flex items-center gap-1">
                <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                {contract.start_date.slice(0, 10)} → {contract.end_date.slice(0, 10)}
              </dd>
            </div>
            <div>
              <dt className="text-shell-muted">Credits</dt>
              <dd className="text-shell-text">
                {contract.credit_allocation.initial.toLocaleString()} initial ·{' '}
                {contract.credit_allocation.renewal.toLocaleString()} renewal
              </dd>
            </div>
            <div>
              <dt className="text-shell-muted">Renewal</dt>
              <dd className="text-shell-text">
                {contract.auto_renewal
                  ? `Auto-renew (${contract.renewal_terms.billing_cycle})`
                  : 'Manual renewal'}
              </dd>
            </div>
            <div>
              <dt className="text-shell-muted">
                {contract.auto_renewal ? 'Days until renewal' : 'Days until expiry'}
              </dt>
              <dd className="text-shell-text">
                {contract.auto_renewal && contract.days_until_renewal !== null
                  ? contract.days_until_renewal
                  : contract.days_until_expiry}{' '}
                days
              </dd>
            </div>
          </dl>

          {notifications.length > 0 && (
            <ul className="space-y-2" aria-label="Contract expiry notifications">
              {notifications.map((n) => (
                <li
                  key={`${n.severity}-${n.days_remaining}`}
                  className={`flex gap-2 rounded-lg border px-3 py-2 text-label ${alertStyles[n.severity]}`}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{n.message}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export default ContractStatusWidget;
