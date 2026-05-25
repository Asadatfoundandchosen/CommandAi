import { useCallback, useEffect, useState } from 'react';
import { Shield, RefreshCw } from 'lucide-react';

type SsoEnforcement = {
  org_id: string;
  enforce: boolean;
  saml_enabled: boolean;
  oidc_enabled: boolean;
  saml_login_url: string | null;
  oidc_login_url: string | null;
};

/**
 * Org admin SSO enforcement — `GET/PUT /api/v1/organization/sso-enforcement`
 * and emergency access grant/revoke.
 */
export function SsoEnforcementAdmin() {
  const [config, setConfig] = useState<SsoEnforcement | null>(null);
  const [enforce, setEnforce] = useState(false);
  const [emergencyUserId, setEmergencyUserId] = useState('');
  const [emergencyTtlHours, setEmergencyTtlHours] = useState(24);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [granting, setGranting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [grantResult, setGrantResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/organization/sso-enforcement', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const json = (await res.json()) as { data: SsoEnforcement };
      setConfig(json.data);
      setEnforce(json.data.enforce);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/v1/organization/sso-enforcement', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enforce }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Save failed (${res.status})`);
      }
      setSaved(true);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const grantEmergency = async () => {
    if (!emergencyUserId.trim()) {
      setError('User ID required for emergency access');
      return;
    }
    setGranting(true);
    setError(null);
    setGrantResult(null);
    try {
      const res = await fetch('/api/v1/organization/emergency-access', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: emergencyUserId.trim(),
          ttl_hours: emergencyTtlHours,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Grant failed (${res.status})`);
      }
      const json = (await res.json()) as { data: { expires_at: string } };
      setGrantResult(`Emergency access until ${new Date(json.data.expires_at).toLocaleString()}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Grant failed');
    } finally {
      setGranting(false);
    }
  };

  const revokeEmergency = async () => {
    if (!emergencyUserId.trim()) return;
    setGranting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/v1/organization/emergency-access/${emergencyUserId.trim()}`,
        { method: 'DELETE', credentials: 'include' },
      );
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Revoke failed (${res.status})`);
      }
      setGrantResult('Emergency access revoked');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revoke failed');
    } finally {
      setGranting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-6">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading SSO enforcement…
      </div>
    );
  }

  const canEnforce = config?.saml_enabled || config?.oidc_enabled;

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">SSO enforcement</h1>
          <p className="text-sm text-muted-foreground">
            Require all users to sign in via SAML or OIDC. Grant time-limited emergency
            password access for break-glass scenarios.
          </p>
        </div>
      </div>

      {!canEnforce && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm">
          Configure SAML or OIDC before enabling enforcement.
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-md border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-700">
          SSO enforcement saved.
        </div>
      )}
      {grantResult && (
        <div className="rounded-md border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-700">
          {grantResult}
        </div>
      )}

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enforce}
          onChange={(e) => setEnforce(e.target.checked)}
          disabled={!canEnforce}
          className="h-4 w-4"
        />
        <span className="font-medium">Require SSO login (block password & magic link)</span>
      </label>

      {config?.saml_login_url && (
        <p className="text-xs text-muted-foreground font-mono break-all">
          SAML: {config.saml_login_url}
        </p>
      )}
      {config?.oidc_login_url && (
        <p className="text-xs text-muted-foreground font-mono break-all">
          OIDC: {config.oidc_login_url}
        </p>
      )}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || !canEnforce}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save enforcement'}
      </button>

      <div className="space-y-3 rounded-lg border p-4">
        <h2 className="font-medium">Emergency access</h2>
        <p className="text-sm text-muted-foreground">
          Allows password login for a specific user until expiry. All emergency logins are
          alerted in logs.
        </p>
        <input
          type="text"
          value={emergencyUserId}
          onChange={(e) => setEmergencyUserId(e.target.value)}
          placeholder="User ObjectId (24-char hex)"
          className="w-full rounded-md border px-3 py-2 text-sm font-mono"
        />
        <div>
          <label className="text-sm font-medium">TTL (hours)</label>
          <input
            type="number"
            min={1}
            max={168}
            value={emergencyTtlHours}
            onChange={(e) => setEmergencyTtlHours(Number(e.target.value))}
            className="w-24 rounded-md border px-3 py-2 text-sm ml-2"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void grantEmergency()}
            disabled={granting}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          >
            Grant
          </button>
          <button
            type="button"
            onClick={() => void revokeEmergency()}
            disabled={granting}
            className="rounded-md border px-4 py-2 text-sm disabled:opacity-50"
          >
            Revoke
          </button>
        </div>
      </div>
    </div>
  );
}
