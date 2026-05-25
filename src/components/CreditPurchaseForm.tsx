/**
 * Org admin credit pack checkout — Stripe Elements + `POST /api/v1/credits/purchase`.
 *
 * Requires frontend deps (Lovable / app package):
 *   npm install @stripe/react-stripe-js @stripe/stripe-js
 *
 * Env: `STRIPE_PUBLISHABLE_KEY` on API; JWT with `org_id` (session cookie or Bearer).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Coins, CreditCard, Loader2 } from 'lucide-react';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe } from '@stripe/stripe-js';

type PurchaseIntentResponse = {
  clientSecret: string;
  publishableKey: string | null;
  amountCredits: number;
  totalUsdCents: number;
  pricePerCreditUsd: number;
};

type CreditBalance = {
  balance: number;
  reserved: number;
  lifetime_purchased: number;
  lifetime_used: number;
};

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function formatCredits(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

type CheckoutFormProps = {
  amountCredits: number;
  totalUsdCents: number;
  onSuccess: () => void;
};

function CheckoutForm({ amountCredits, totalUsdCents, onSuccess }: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) {
      return;
    }
    setSubmitting(true);
    setError(null);
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/usage?purchase=success`,
      },
      redirect: 'if_required',
    });
    setSubmitting(false);
    if (confirmError) {
      setError(confirmError.message ?? 'Payment failed');
      return;
    }
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-shell-muted">
        Purchasing <strong>{formatCredits(amountCredits)}</strong> credits for{' '}
        <strong>{formatUsd(totalUsdCents)}</strong>
      </p>
      <PaymentElement />
      {error ? (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!stripe || submitting}
        className="inline-flex items-center gap-2 rounded-lg bg-shell-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        Pay {formatUsd(totalUsdCents)}
      </button>
    </form>
  );
}

/**
 * Credit purchase UI for org admins. Mount on `/usage` or billing settings.
 */
export function CreditPurchaseForm() {
  const [amount, setAmount] = useState(1000);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [checkoutMeta, setCheckoutMeta] = useState<{
    amountCredits: number;
    totalUsdCents: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadBalance = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/credits/balance', { credentials: 'include' });
      if (!res.ok) {
        return;
      }
      const json = (await res.json()) as { data: CreditBalance };
      setBalance(json.data);
    } catch {
      /* balance optional until first purchase */
    }
  }, []);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  const stripePromise = useMemo(() => {
    if (!publishableKey) {
      return null;
    }
    return loadStripe(publishableKey);
  }, [publishableKey]);

  const startPurchase = async () => {
    setLoading(true);
    setError(null);
    setSuccess(null);
    setClientSecret(null);
    setCheckoutMeta(null);
    try {
      const res = await fetch('/api/v1/credits/purchase', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount }),
      });
      const json = (await res.json()) as { data?: PurchaseIntentResponse; error?: unknown };
      if (!res.ok) {
        const msg =
          typeof json.error === 'string'
            ? json.error
            : 'Could not start purchase. Check Stripe configuration and billing email.';
        throw new Error(msg);
      }
      const data = json.data!;
      if (!data.publishableKey) {
        throw new Error('Stripe publishable key is not configured on the server');
      }
      setClientSecret(data.clientSecret);
      setPublishableKey(data.publishableKey);
      setCheckoutMeta({
        amountCredits: data.amountCredits,
        totalUsdCents: data.totalUsdCents,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Purchase failed');
    } finally {
      setLoading(false);
    }
  };

  const onPaymentSuccess = () => {
    setSuccess('Payment received — credits will appear in your balance shortly.');
    setClientSecret(null);
    setCheckoutMeta(null);
    void loadBalance();
  };

  const estimatedCents = Math.round(amount * 0.01 * 100);

  return (
    <section className="rounded-xl border border-shell-border bg-shell-surface p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Coins className="h-5 w-5 text-shell-accent" />
        <h2 className="text-lg font-semibold text-shell-fg">Buy credits</h2>
      </div>

      {balance ? (
        <p className="text-sm text-shell-muted">
          Current balance: <strong>{formatCredits(balance.balance)}</strong>
          {balance.reserved > 0 ? (
            <span> ({formatCredits(balance.reserved)} reserved)</span>
          ) : null}
        </p>
      ) : null}

      {!clientSecret ? (
        <div className="space-y-3">
          <label className="block text-sm text-shell-muted">
            Credits to purchase
            <input
              type="number"
              min={100}
              step={100}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-shell-border bg-shell-bg px-3 py-2 text-shell-fg"
            />
          </label>
          <p className="text-xs text-shell-muted">
            $0.01 per credit · estimated total {formatUsd(estimatedCents)} (min 100 credits)
          </p>
          {error ? (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="text-sm text-emerald-400" role="status">
              {success}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void startPurchase()}
            disabled={loading || amount < 100}
            className="inline-flex items-center gap-2 rounded-lg bg-shell-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
            Continue to payment
          </button>
        </div>
      ) : null}

      {clientSecret && stripePromise && checkoutMeta ? (
        <Elements
          stripe={stripePromise as Promise<Stripe | null>}
          options={{ clientSecret, appearance: { theme: 'night' } }}
        >
          <CheckoutForm
            amountCredits={checkoutMeta.amountCredits}
            totalUsdCents={checkoutMeta.totalUsdCents}
            onSuccess={onPaymentSuccess}
          />
        </Elements>
      ) : null}
    </section>
  );
}
