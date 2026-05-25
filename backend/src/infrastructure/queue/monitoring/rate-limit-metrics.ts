import { Counter, type Registry } from "prom-client";

let counter: Counter | undefined;

/** Call once from `setupQueueMonitoring` so the counter is on the same registry as `/metrics`. */
export function registerRateLimitMetrics(register: Registry): void {
  if (counter) {
    return;
  }
  counter = new Counter({
    name: "http_ratelimit_429_total",
    help: "Sliding-window rate limiter HTTP 429 responses by dimension (tenant / user / endpoint).",
    labelNames: ["dimension"],
    registers: [register],
  });
}

export function recordRateLimit429(
  dimension: "tenant" | "user" | "endpoint",
): void {
  counter?.inc({ dimension });
}

/** Snapshot for `GET /api/admin/rate-limits` dashboard. */
export async function getRateLimit429Totals(): Promise<
  Record<"tenant" | "user" | "endpoint" | "total", number>
> {
  const out: Record<"tenant" | "user" | "endpoint" | "total", number> = {
    tenant: 0,
    user: 0,
    endpoint: 0,
    total: 0,
  };
  if (!counter) {
    return out;
  }
  const metric = await counter.get();
  for (const v of metric.values) {
    const dim = v.labels.dimension as "tenant" | "user" | "endpoint" | undefined;
    if (dim === "tenant" || dim === "user" || dim === "endpoint") {
      out[dim] += v.value;
      out.total += v.value;
    }
  }
  return out;
}
