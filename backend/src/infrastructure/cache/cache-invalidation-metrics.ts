import { Counter, type Registry } from "prom-client";

let runs: Counter | undefined;
let keysRemoved: Counter | undefined;

export function registerCacheInvalidationMetrics(register: Registry): void {
  if (runs) {
    return;
  }
  runs = new Counter({
    name: "cache_invalidation_runs_total",
    help: "Tag-based cache invalidation runs (by resource / reason).",
    labelNames: ["resource", "scope"],
    registers: [register],
  });
  keysRemoved = new Counter({
    name: "cache_invalidation_keys_removed_total",
    help: "Response cache keys deleted during invalidation.",
    labelNames: ["resource"],
    registers: [register],
  });
}

export function recordCacheInvalidationRun(
  resource: string,
  scope: "all" | "id" | "event",
): void {
  runs?.inc({ resource, scope });
}

export function recordCacheInvalidationKeys(resource: string, n: number): void {
  if (n <= 0) {
    return;
  }
  keysRemoved?.inc({ resource }, n);
}
