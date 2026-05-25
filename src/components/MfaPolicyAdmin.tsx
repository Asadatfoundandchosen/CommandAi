import { useCallback, useEffect, useState } from 'react';
import { Shield, AlertTriangle, RefreshCw } from 'lucide-react';

type MfaRequiredFor = 'all' | 'admins' | 'none';
type MfaAllowedMethod = 'totp' | 'sms' | 'email' | 'webauthn';

type MfaPolicy = {
  org_id: string;
  enabled: boolean;
  required_for: MfaRequiredFor;
  grace_period_days: number;
  allowed_methods: MfaAllowedMethod[];
  enforcement_date: string | null;
  grace_period_end: string | null;
  days_remaining: number | null;
  enforcement_active: boolean;
};

const METHOD_OPTIONS: { id: MfaAllowedMethod; label: string }[] = [
  { id: 'totp', label: 'Authenticator app (TOTP)' },
  { id: 'sms', label: 'SMS' },
  { id: 'email', label: 'Email (coming soon)' },
  { id: 'webauthn', label: 'Security key (coming soon)' },
];

/**
 * Org admin MFA enforcement policy — `GET/PUT /api/v1/organization/mfa-policy`.
 * Mount at `/settings/security/mfa-policy` for org_admin users.
 */
export function MfaPolicyAdmin() {
  const [policy, setPolicy] = useState<MfaPolicy | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [requiredFor, setRequiredFor] = useState<MfaRequiredFor>('all');
  const [graceDays, setGraceDays] = useState(14);
  const [methods, setMethods] = useState<MfaAllowedMethod[]>(['totp', 'sms']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/organization/mfa-policy', {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to load policy (${res.status})`);
      }
      const json = (await res.json()) as { data: MfaPolicy };
      setPolicy(json.data);
      setEnabled(json.data.enabled);
      setRequiredFor(json.data.required_for);
      setGraceDays(json.data.grace_period_days);
      setMethods(json.data.allowed_methods ?? ['totp', 'sms']);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleMethod = (method: MfaAllowedMethod) => {
    setMethods((prev) =>
      prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method],
    );
  };

  const save = async () => {
    if (methods.length === 0) {
      setError('Select at least one allowed MFA method');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/v1/organization/mfa-policy', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          required_for: requiredFor,
          grace_period_days: graceDays,
          allowed_methods: methods,
        }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `Save failed (${res.status})`);
      }
      const json = (await res.json()) as { data: MfaPolicy };
      setPolicy(json.data);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 text-shell-muted text-sm">Loading MFA policy…</div>
    );
  }

  const showLowWarning =
    policy?.enabled &&
    policy.days_remaining !== null &&
    policy.days_remaining <= 3 &&
    !policy.enforcement_active;

  return (
    <div className="rounded-xl border border-shell-border bg-shell-surface p-6 space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-shell-accent" />
        <div>
          <h2 className="text-lg font-semibold text-shell-fg">MFA enforcement</h2>
          <p className="text-sm text-shell-muted">
            Require MFA for users in your organization after a grace period.
          </p>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="text-sm text-emerald-400">Policy saved.</p>
      )}
      {showLowWarning && (
        <div className="flex gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Grace period ends in {policy?.days_remaining} day(s). Users without MFA
            will be blocked from API access after{' '}
            {policy?.grace_period_end
              ? new Date(policy.grace_period_end).toLocaleDateString()
              : 'the deadline'}
            .
          </span>
        </div>
      )}
      {policy?.enforcement_active && (
        <p className="text-sm text-amber-200">
          Enforcement is active — users without MFA cannot access tenant APIs (auth
          routes remain available for setup).
        </p>
      )}

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="rounded border-shell-border"
        />
        <span className="text-sm text-shell-fg">Enable MFA enforcement</span>
      </label>

      <div className="space-y-2">
        <label className="text-sm text-shell-muted">Required for</label>
        <select
          value={requiredFor}
          onChange={(e) => setRequiredFor(e.target.value as MfaRequiredFor)}
          disabled={!enabled}
          className="w-full rounded-lg border border-shell-border bg-shell-bg px-3 py-2 text-sm"
        >
          <option value="none">None (disabled)</option>
          <option value="all">All users</option>
          <option value="admins">Admins only (org + account admin)</option>
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm text-shell-muted">Grace period (days)</label>
        <input
          type="number"
          min={0}
          max={90}
          value={graceDays}
          onChange={(e) => setGraceDays(Number(e.target.value))}
          disabled={!enabled}
          className="w-full rounded-lg border border-shell-border bg-shell-bg px-3 py-2 text-sm"
        />
      </div>

      <fieldset className="space-y-2" disabled={!enabled}>
        <legend className="text-sm text-shell-muted">Allowed methods</legend>
        {METHOD_OPTIONS.map((opt) => (
          <label key={opt.id} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={methods.includes(opt.id)}
              onChange={() => toggleMethod(opt.id)}
              disabled={opt.id === 'email' || opt.id === 'webauthn'}
            />
            {opt.label}
          </label>
        ))}
      </fieldset>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="inline-flex items-center gap-2 rounded-lg bg-shell-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
        Save policy
      </button>
    </div>
  );
}
