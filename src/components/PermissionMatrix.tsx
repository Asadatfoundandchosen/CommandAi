import { useCallback, useEffect, useMemo, useState } from 'react';
import { Grid3X3, RefreshCw, Shield } from 'lucide-react';

type RoleRow = {
  id?: string;
  name: string;
  display_name: string;
  is_system: boolean;
  hierarchy_level: number;
  permissions: string[];
};

type MatrixPayload = {
  format: string;
  resources: string[];
  actions: string[];
  scopes: string[];
  cells: Array<{ permission: string; resource: string; action: string; scope: string }>;
  system_roles: RoleRow[];
  roles: RoleRow[];
};

/**
 * Permission matrix — `GET /api/v1/roles/permission-matrix`.
 * Mount at `/settings/security/permission-matrix` for org_admin users.
 */
export function PermissionMatrix() {
  const [data, setData] = useState<MatrixPayload | null>(null);
  const [scopeFilter, setScopeFilter] = useState<string>('organization');
  const [resourceFilter, setResourceFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/roles/permission-matrix', {
        credentials: 'include',
      });
      if (!res.ok) {
        throw new Error(`Failed to load matrix (${res.status})`);
      }
      const json = (await res.json()) as { data: MatrixPayload };
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

  const displayRoles = useMemo(() => {
    if (!data) return [];
    const custom = data.roles.filter((r) => !r.is_system);
    return [...data.system_roles, ...custom];
  }, [data]);

  const actions = useMemo(() => {
    if (!data) return [];
    return data.actions.filter((a) => a !== '*');
  }, [data]);

  const resources = useMemo(() => {
    if (!data) return [];
    if (resourceFilter === 'all') return data.resources;
    return data.resources.filter((r) => r === resourceFilter);
  }, [data, resourceFilter]);

  const roleHasGrant = (role: RoleRow, resource: string, action: string): boolean => {
    const required = `${resource}:${action}:${scopeFilter}`;
    return role.permissions.some((grant) => {
      if (grant === '*:*:*') return true;
      const [gr, ga, gs] = grant.split(':');
      const resourceOk = gr === '*' || gr === resource;
      const actionOk = ga === '*' || ga === action;
      if (!resourceOk || !actionOk) return false;
      if (gs === '*' || gs === scopeFilter) return true;
      const order = ['own', 'department', 'account', 'organization', '*'];
      return (order.indexOf(gs) ?? 0) >= (order.indexOf(scopeFilter) ?? 0);
    }) || role.permissions.includes(required);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading permission matrix…
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
    <div className="space-y-6 p-6 max-w-full overflow-x-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Grid3X3 className="h-5 w-5" />
            Permission matrix
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Format: <code className="text-xs bg-muted px-1 rounded">{data.format}</code>
            {' '}
            — wildcards and scope breadth supported. See{' '}
            <code className="text-xs">docs/RBAC-PERMISSIONS.md</code>.
          </p>
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

      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          Scope
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            className="border rounded px-2 py-1 bg-background"
          >
            {data.scopes.filter((s) => s !== '*').map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Resource
          <select
            value={resourceFilter}
            onChange={(e) => setResourceFilter(e.target.value)}
            className="border rounded px-2 py-1 bg-background"
          >
            <option value="all">All</option>
            {data.resources.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-xs border-collapse min-w-[720px]">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-2 border-b sticky left-0 bg-muted/50 z-10">
                Role
              </th>
              {resources.map((resource) =>
                actions.map((action) => (
                  <th
                    key={`${resource}-${action}`}
                    className="p-2 border-b text-center whitespace-nowrap font-medium"
                    title={`${resource}:${action}:${scopeFilter}`}
                  >
                    {resource}
                    <span className="text-muted-foreground">:{action}</span>
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {displayRoles.map((role) => (
              <tr key={role.name + (role.id ?? '')} className="hover:bg-muted/30">
                <td className="p-2 border-b sticky left-0 bg-background z-10">
                  <div className="font-medium flex items-center gap-1">
                    {role.is_system && <Shield className="h-3 w-3 text-primary" />}
                    {role.display_name}
                  </div>
                  <div className="text-muted-foreground">{role.name}</div>
                </td>
                {resources.map((resource) =>
                  actions.map((action) => {
                    const on = roleHasGrant(role, resource, action);
                    return (
                      <td
                        key={`${role.name}-${resource}-${action}`}
                        className={`p-2 border-b text-center ${on ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground/40'}`}
                      >
                        {on ? '●' : '○'}
                      </td>
                    );
                  }),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Raw grants by role</summary>
        <ul className="mt-2 space-y-2 font-mono text-xs">
          {displayRoles.map((role) => (
            <li key={role.name + (role.id ?? '')}>
              <strong>{role.name}:</strong>{' '}
              {role.permissions.join(', ') || '(none)'}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
