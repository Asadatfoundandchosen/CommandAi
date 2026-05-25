import { useCallback, useEffect, useState } from 'react';
import { Shield, LogIn } from 'lucide-react';

type SsoLoginOptions = {
  enforce: boolean;
  org_id: string | null;
  saml_login_url: string | null;
  oidc_login_url: string | null;
  message: string | null;
};

/**
 * Login page with SSO redirect when org enforces IdP sign-in.
 * Uses `GET /api/v1/auth/sso-login-options?email=…&org_id=…` (debounced on email blur).
 */
export function LoginPage() {
  const [email, setEmail] = useState('');
  const [orgId, setOrgId] = useState('');
  const [password, setPassword] = useState('');
  const [sso, setSso] = useState<SsoLoginOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSsoOptions = useCallback(async (emailValue: string, orgIdValue?: string) => {
    const trimmed = emailValue.trim();
    if (!trimmed.includes('@')) {
      setSso(null);
      return;
    }
    setLoading(true);
    try {
      const params = new URLSearchParams({ email: trimmed });
      if (orgIdValue?.trim()) {
        params.set('org_id', orgIdValue.trim());
      }
      const res = await fetch(`/api/v1/auth/sso-login-options?${params}`);
      if (!res.ok) {
        setSso(null);
        return;
      }
      const json = (await res.json()) as { data: SsoLoginOptions };
      setSso(json.data);
    } catch {
      setSso(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchSsoOptions(email, orgId);
    }, 400);
    return () => clearTimeout(t);
  }, [email, orgId, fetchSsoOptions]);

  const passwordBlocked = Boolean(sso?.enforce);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, string> = { email: email.trim(), password };
      if (orgId.trim()) body.org_id = orgId.trim();

      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        code?: string;
        sso?: SsoLoginOptions;
      };

      if (res.status === 403 && json.code === 'sso_required') {
        setSso({
          enforce: true,
          org_id: json.sso?.org_id ?? null,
          saml_login_url: json.sso?.saml_login_url ?? null,
          oidc_login_url: json.sso?.oidc_login_url ?? null,
          message: json.error ?? 'SSO login required',
        });
        return;
      }

      if (!res.ok) {
        throw new Error(json.error ?? `Login failed (${res.status})`);
      }

      window.location.href = '/';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md space-y-6 rounded-xl border bg-background p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <LogIn className="h-8 w-8 text-primary" />
          <h1 className="text-2xl font-semibold">Sign in</h1>
        </div>

        {sso?.enforce && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <Shield className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="text-sm">
                {sso.message ??
                  'Your organization requires SSO. Sign in with your identity provider.'}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {sso.saml_login_url && (
                <a
                  href={sso.saml_login_url}
                  className="inline-flex justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                >
                  Continue with SAML SSO
                </a>
              )}
              {sso.oidc_login_url && (
                <a
                  href={sso.oidc_login_url}
                  className="inline-flex justify-center rounded-md border px-4 py-2 text-sm font-medium"
                >
                  Continue with OIDC SSO
                </a>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <form onSubmit={(e) => void submitPassword(e)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Organization ID <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              type="text"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              placeholder="24-char hex"
              className="w-full rounded-md border px-3 py-2 text-sm font-mono"
            />
          </div>
          {!passwordBlocked && (
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          )}
          {!passwordBlocked && (
            <button
              type="submit"
              disabled={submitting || loading}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitting ? 'Signing in…' : 'Sign in with password'}
            </button>
          )}
          {passwordBlocked && (
            <p className="text-xs text-muted-foreground text-center">
              Password sign-in is disabled. Use SSO above or ask an admin for emergency access.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
