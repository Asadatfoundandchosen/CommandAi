import { useCallback, useEffect, useState } from 'react';
import { GitBranch, RefreshCw } from 'lucide-react';

type HierarchyExample = {
  role: string;
  inherits_from: string[];
  direct_permissions: string[];
  inherited_permissions: string[];
  direct_permission_count: number;
  effective_permission_count: number;
};

type HierarchyPayload = {
  label: string;
  chain: string[];
  inheritance: Record<string, string[]>;
  description: string;
  examples: HierarchyExample[];
  cache_ttl_seconds: number;
  cache_key_format?: string;
};

/**
 * Role hierarchy documentation — `GET /api/v1/roles/hierarchy`.
 * Mount at `/settings/security/role-hierarchy` for org_admin users.
 */
export function RoleHierarchyAdmin() {
  const [data, setData] = useState<HierarchyPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/roles/hierarchy', { credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Failed to load hierarchy (${res.status})`);
      }
      const json = (await res.json()) as { data: HierarchyPayload };
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading role hierarchy…
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-destructive">
        {error}
        <button type="button" className="ml-3 underline" onClick={() => void load()}>
          Retry
        </button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-6 p-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Role hierarchy
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{data.description}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4">
        <p className="text-sm font-medium">Chain (highest → lowest)</p>
        <p className="mt-2 font-mono text-sm">{data.label}</p>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Automatic inheritance</p>
        <p className="text-sm text-muted-foreground">
          Each role receives its own permissions plus every permission from roles below it in
          the chain. Effective permissions are cached in Redis (
          <code className="text-xs">{data.cache_key_format ?? 'permissions:{userId}'}</code>) for{' '}
          {Math.round(data.cache_ttl_seconds / 60)} minutes and invalidated when a user&apos;s
          role or role definition changes.
        </p>
        <ul className="space-y-2 text-sm">
          {data.chain.map((role) => (
            <li key={role} className="border rounded-md p-3">
              <span className="font-medium">{role}</span>
              {data.inheritance[role]?.length ? (
                <span className="text-muted-foreground">
                  {' '}
                  ← also inherits: {data.inheritance[role].join(', ')}
                </span>
              ) : (
                <span className="text-muted-foreground"> (base role)</span>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Effective permission counts</p>
        <table className="w-full text-sm border rounded-lg overflow-hidden">
          <thead>
            <tr className="bg-muted/50 text-left">
              <th className="p-2 border-b">Role</th>
              <th className="p-2 border-b">Inherits from</th>
              <th className="p-2 border-b text-right">Direct</th>
              <th className="p-2 border-b text-right">Effective</th>
            </tr>
          </thead>
          <tbody>
            {data.examples.map((row) => (
              <tr key={row.role} className="border-b last:border-0">
                <td className="p-2 font-mono">{row.role}</td>
                <td className="p-2 text-muted-foreground">
                  {row.inherits_from.length > 0 ? row.inherits_from.join(', ') : '—'}
                </td>
                <td className="p-2 text-right">{row.direct_permission_count}</td>
                <td className="p-2 text-right font-medium">
                  {row.effective_permission_count}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
