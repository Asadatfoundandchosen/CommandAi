import { useCallback, useEffect, useState } from 'react';
import { Users, RefreshCw, Plus, Trash2 } from 'lucide-react';

type UserRole =
  | 'org_admin'
  | 'account_admin'
  | 'dept_manager'
  | 'dept_user';

type MappingRow = {
  idp_group: string;
  role: UserRole;
  account_id: string;
  department_id: string;
};

type GroupMappingConfig = {
  org_id: string;
  enabled: boolean;
  fallback_role: UserRole;
  mappings: MappingRow[];
  role_precedence: UserRole[];
};

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'dept_user', label: 'Department user' },
  { value: 'dept_manager', label: 'Department manager' },
  { value: 'account_admin', label: 'Account admin' },
  { value: 'org_admin', label: 'Organization admin' },
];

const emptyRow = (): MappingRow => ({
  idp_group: '',
  role: 'dept_user',
  account_id: '',
  department_id: '',
});

/**
 * Org admin IdP group → role mapping — `GET/PUT /api/v1/organization/group-mapping`.
 * Mount at `/settings/security/group-mapping` for org_admin users.
 */
export function GroupMappingAdmin() {
  const [enabled, setEnabled] = useState(false);
  const [fallbackRole, setFallbackRole] = useState<UserRole>('dept_user');
  const [rows, setRows] = useState<MappingRow[]>([emptyRow()]);
  const [precedence, setPrecedence] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/organization/group-mapping', {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to load (${res.status})`);
      }
      const json = (await res.json()) as { data: GroupMappingConfig };
      setEnabled(json.data.enabled);
      setFallbackRole(json.data.fallback_role);
      setPrecedence(json.data.role_precedence ?? []);
      setRows(
        json.data.mappings.length > 0
          ? json.data.mappings.map((m) => ({
              idp_group: m.idp_group,
              role: m.role,
              account_id: m.account_id ?? '',
              department_id: m.department_id ?? '',
            }))
          : [emptyRow()],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateRow = (index: number, patch: Partial<MappingRow>) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const addRow = () => setRows((prev) => [...prev, emptyRow()]);

  const removeRow = (index: number) => {
    setRows((prev) => (prev.length <= 1 ? [emptyRow()] : prev.filter((_, i) => i !== index)));
  };

  const save = async () => {
    const mappings = rows
      .filter((r) => r.idp_group.trim())
      .map((r) => {
        const entry: Record<string, string> = {
          idp_group: r.idp_group.trim(),
          role: r.role,
        };
        if (r.account_id.trim()) entry.account_id = r.account_id.trim();
        if (r.department_id.trim()) entry.department_id = r.department_id.trim();
        return entry;
      });

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch('/api/v1/organization/group-mapping', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled,
          fallback_role: fallbackRole,
          mappings,
        }),
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

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground p-6">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading group mappings…
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Users className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">IdP group mapping</h1>
          <p className="text-sm text-muted-foreground">
            Map IdP groups to application roles. Roles sync on every SAML/OIDC login.
            Users not in any mapped group receive the fallback role.
          </p>
        </div>
      </div>

      {precedence.length > 0 && (
        <p className="text-xs text-muted-foreground">
          When multiple groups match, highest role wins:{' '}
          {precedence.join(' → ')}
        </p>
      )}

      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {saved && (
        <div className="rounded-md border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm text-green-700">
          Group mapping saved.
        </div>
      )}

      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4"
        />
        <span className="font-medium">Enable group sync on SSO login</span>
      </label>

      <div>
        <label className="block text-sm font-medium mb-1">
          Fallback role (when no IdP group matches)
        </label>
        <select
          value={fallbackRole}
          onChange={(e) => setFallbackRole(e.target.value as UserRole)}
          className="w-full max-w-xs rounded-md border px-3 py-2 text-sm"
        >
          {ROLE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Group → role mappings</h2>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1 text-sm text-primary"
          >
            <Plus className="h-4 w-4" /> Add row
          </button>
        </div>

        {rows.map((row, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-5"
          >
            <div className="lg:col-span-2">
              <label className="text-xs text-muted-foreground">IdP group ID / name</label>
              <input
                type="text"
                value={row.idp_group}
                onChange={(e) => updateRow(index, { idp_group: e.target.value })}
                placeholder="Platform-Admins"
                className="w-full rounded-md border px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Application role</label>
              <select
                value={row.role}
                onChange={(e) => updateRow(index, { role: e.target.value as UserRole })}
                className="w-full rounded-md border px-2 py-1.5 text-sm"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Account ID (optional)</label>
              <input
                type="text"
                value={row.account_id}
                onChange={(e) => updateRow(index, { account_id: e.target.value })}
                className="w-full rounded-md border px-2 py-1.5 text-sm font-mono"
              />
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Department ID (optional)</label>
                <input
                  type="text"
                  value={row.department_id}
                  onChange={(e) => updateRow(index, { department_id: e.target.value })}
                  className="w-full rounded-md border px-2 py-1.5 text-sm font-mono"
                />
              </div>
              <button
                type="button"
                onClick={() => removeRow(index)}
                className="p-2 text-muted-foreground hover:text-destructive"
                aria-label="Remove row"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save mappings'}
      </button>
    </div>
  );
}
