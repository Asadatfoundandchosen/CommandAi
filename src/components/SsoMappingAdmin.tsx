import { useCallback, useEffect, useState } from 'react';
import { UserPlus, RefreshCw } from 'lucide-react';

type UserRole =
  | 'org_admin'
  | 'account_admin'
  | 'dept_manager'
  | 'dept_user';

type SsoMapping = {
  org_id: string;
  jit_enabled: boolean;
  default_role: UserRole;
  default_account_id: string | null;
  default_department_id: string | null;
  first_name_attr: string | null;
  last_name_attr: string | null;
  department_attr: string | null;
};

type AttributeHints = {
  first_name: string[];
  last_name: string[];
  department: string[];
};

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'dept_user', label: 'Department user' },
  { value: 'dept_manager', label: 'Department manager' },
  { value: 'account_admin', label: 'Account admin' },
  { value: 'org_admin', label: 'Organization admin' },
];

/**
 * Org admin JIT SSO mapping — `GET/PUT /api/v1/organization/sso-mapping`.
 * Mount at `/settings/security/sso-mapping` for org_admin users.
 */
export function SsoMappingAdmin() {
  const [mapping, setMapping] = useState<SsoMapping | null>(null);
  const [hints, setHints] = useState<AttributeHints | null>(null);
  const [jitEnabled, setJitEnabled] = useState(false);
  const [defaultRole, setDefaultRole] = useState<UserRole>('dept_user');
  const [accountId, setAccountId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [firstNameAttr, setFirstNameAttr] = useState('');
  const [lastNameAttr, setLastNameAttr] = useState('');
  const [departmentAttr, setDepartmentAttr] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/organization/sso-mapping', {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to load mapping (${res.status})`);
      }
      const json = (await res.json()) as {
        data: SsoMapping;
        attribute_hints?: AttributeHints;
      };
      setMapping(json.data);
      setHints(json.attribute_hints ?? null);
      setJitEnabled(json.data.jit_enabled);
      setDefaultRole(json.data.default_role);
      setAccountId(json.data.default_account_id ?? '');
      setDepartmentId(json.data.default_department_id ?? '');
      setFirstNameAttr(json.data.first_name_attr ?? '');
      setLastNameAttr(json.data.last_name_attr ?? '');
      setDepartmentAttr(json.data.department_attr ?? '');
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
    if (jitEnabled && (!accountId.trim() || !departmentId.trim())) {
      setError('Default account and department IDs are required when JIT is enabled');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const body: Record<string, unknown> = {
        jit_enabled: jitEnabled,
        default_role: defaultRole,
      };
      if (accountId.trim()) body.default_account_id = accountId.trim();
      if (departmentId.trim()) body.default_department_id = departmentId.trim();
      if (firstNameAttr.trim()) body.first_name_attr = firstNameAttr.trim();
      if (lastNameAttr.trim()) body.last_name_attr = lastNameAttr.trim();
      if (departmentAttr.trim()) body.department_attr = departmentAttr.trim();

      const res = await fetch('/api/v1/organization/sso-mapping', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Save failed (${res.status})`);
      }
      const json = (await res.json()) as { data: SsoMapping };
      setMapping(json.data);
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-6">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading SSO mapping…
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <UserPlus className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">JIT SSO provisioning</h1>
          <p className="text-sm text-muted-foreground">
            Automatically create users on first SAML or OIDC login. Map IdP attributes to
            profile fields and assign a default role and department.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-md border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-700">
          SSO mapping saved.
        </div>
      )}

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={jitEnabled}
          onChange={(e) => setJitEnabled(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="font-medium">Enable JIT provisioning on first SSO login</span>
      </label>

      <div className="space-y-4 rounded-lg border p-4">
        <h2 className="font-medium">Defaults for new users</h2>

        <div>
          <label className="block text-sm font-medium mb-1">Default role</label>
          <select
            value={defaultRole}
            onChange={(e) => setDefaultRole(e.target.value as UserRole)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Default account ID (24-char hex)
          </label>
          <input
            type="text"
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            placeholder={mapping?.default_account_id ?? ''}
            className="w-full rounded-md border px-3 py-2 text-sm font-mono"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Default department ID (24-char hex)
          </label>
          <input
            type="text"
            value={departmentId}
            onChange={(e) => setDepartmentId(e.target.value)}
            placeholder={mapping?.default_department_id ?? ''}
            className="w-full rounded-md border px-3 py-2 text-sm font-mono"
          />
        </div>
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <h2 className="font-medium">IdP attribute mapping</h2>
        <p className="text-xs text-muted-foreground">
          Optional claim / SAML attribute keys. Leave blank to use common defaults (
          {hints?.first_name.slice(0, 2).join(', ')}…).
        </p>

        <div>
          <label className="block text-sm font-medium mb-1">First name attribute</label>
          <input
            type="text"
            value={firstNameAttr}
            onChange={(e) => setFirstNameAttr(e.target.value)}
            placeholder="given_name"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Last name attribute</label>
          <input
            type="text"
            value={lastNameAttr}
            onChange={(e) => setLastNameAttr(e.target.value)}
            placeholder="family_name"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Department attribute (match department name in default account)
          </label>
          <input
            type="text"
            value={departmentAttr}
            onChange={(e) => setDepartmentAttr(e.target.value)}
            placeholder="department"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save mapping'}
      </button>
    </div>
  );
}
