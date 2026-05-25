import { useCallback, useEffect, useState } from "react";

type RateLimitDashboardData = {
  enabled: boolean;
  tiers: {
    default: { window: number; max: number };
    tenant: { window: number; max: number };
    expensive: { window: number; max: number };
  };
  effective_default: {
    tenant: { window: number; max: number };
    user: { window: number; max: number };
    endpoint: { window: number; max: number };
  };
  effective_expensive: {
    tenant: { window: number; max: number };
    user: { window: number; max: number };
    endpoint: { window: number; max: number };
  };
  metrics_429_total: {
    tenant: number;
    user: number;
    endpoint: number;
    total: number;
  };
  grafana: { dashboard_uid: string; title: string };
};

type Props = {
  adminToken: string;
  apiBase?: string;
};

export function RateLimitDashboard({ adminToken, apiBase = "" }: Props) {
  const [data, setData] = useState<RateLimitDashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/admin/rate-limits`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as { data: RateLimitDashboardData };
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load rate limits");
    } finally {
      setLoading(false);
    }
  }, [adminToken, apiBase]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return <p>Loading rate limit policy…</p>;
  }
  if (error) {
    return <p role="alert">Error: {error}</p>;
  }
  if (!data) {
    return null;
  }

  return (
    <section>
      <h2>API rate limits</h2>
      <p>Limiter {data.enabled ? "enabled" : "disabled"} — sliding window (Redis sorted sets).</p>

      <table>
        <thead>
          <tr>
            <th>Tier</th>
            <th>Window (s)</th>
            <th>Max requests</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Tenant</td>
            <td>{data.tiers.tenant.window}</td>
            <td>{data.tiers.tenant.max}</td>
          </tr>
          <tr>
            <td>User (default)</td>
            <td>{data.tiers.default.window}</td>
            <td>{data.tiers.default.max}</td>
          </tr>
          <tr>
            <td>Endpoint (expensive)</td>
            <td>{data.tiers.expensive.window}</td>
            <td>{data.tiers.expensive.max}</td>
          </tr>
        </tbody>
      </table>

      <h3>HTTP 429 totals (this process)</h3>
      <ul>
        <li>Tenant: {data.metrics_429_total.tenant}</li>
        <li>User: {data.metrics_429_total.user}</li>
        <li>Endpoint: {data.metrics_429_total.endpoint}</li>
        <li>Total: {data.metrics_429_total.total}</li>
      </ul>

      <p>
        Grafana: <code>{data.grafana.dashboard_uid}</code> — {data.grafana.title}
      </p>
    </section>
  );
}
