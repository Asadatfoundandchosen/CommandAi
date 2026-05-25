import { useCallback, useEffect, useState } from 'react';
import { Coins, Sparkles } from 'lucide-react';

type CreditRateKey =
  | 'signal_processed'
  | 'action_executed'
  | 'hitl_decision'
  | 'data_sync_gb'
  | 'report_generated';

type RateCardResponse = {
  rates: Record<CreditRateKey, number>;
  labels: Record<CreditRateKey, string>;
  source: 'default' | 'custom';
  org_id: string;
};

/**
 * Org admin rate card — `GET /api/v1/credits/rates`.
 * Mount on usage/billing dashboard alongside `UsageDashboard`.
 */
export function CreditRateCard() {
  const [card, setCard] = useState<RateCardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/credits/rates', { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Failed to load rates (${res.status})`);
      }
      const json = (await res.json()) as { data: RateCardResponse };
      setCard(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load rate card');
      setCard(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = card
    ? (Object.keys(card.rates) as CreditRateKey[]).map((key) => ({
        key,
        label: card.labels[key] ?? key,
        credits: card.rates[key],
      }))
    : [];

  return (
    <section
      className="rounded-xl border border-shell-border bg-shell-surface p-4 space-y-3"
      aria-label="Credit rate card"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-shell-text">
          <Coins className="w-4 h-4 text-shell-accent" />
          <h3 className="text-body font-medium">Credit rate card</h3>
        </div>
        {card?.source === 'custom' && (
          <span className="inline-flex items-center gap-1 text-[11px] text-amber-400/90 bg-amber-500/10 px-2 py-0.5 rounded-full">
            <Sparkles className="w-3 h-3" />
            Enterprise custom
          </span>
        )}
      </div>

      <p className="text-label text-shell-muted">
        Credits consumed per unit of usage. Contact your platform admin for custom enterprise
        pricing.
      </p>

      {loading && !card && (
        <p className="text-label text-shell-muted">Loading rates…</p>
      )}
      {error && (
        <p className="text-label text-red-400" role="alert">
          {error}
        </p>
      )}

      {card && (
        <ul className="divide-y divide-shell-border rounded-lg border border-shell-border">
          {entries.map((row) => (
            <li
              key={row.key}
              className="flex items-center justify-between px-3 py-2.5 text-label"
            >
              <span className="text-shell-text">{row.label}</span>
              <span className="font-medium text-shell-accent tabular-nums">
                {row.credits} {row.credits === 1 ? 'credit' : 'credits'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default CreditRateCard;
