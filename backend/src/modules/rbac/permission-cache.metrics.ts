import { Counter, type Registry } from "prom-client";

let hits: Counter | undefined;
let misses: Counter | undefined;
let invalidations: Counter | undefined;

export function registerPermissionCacheMetrics(register: Registry): void {
  if (!hits) {
    hits = new Counter({
      name: "rbac_permission_cache_hits_total",
      help: "Permission cache Redis hits",
      registers: [register],
    });
  }
  if (!misses) {
    misses = new Counter({
      name: "rbac_permission_cache_misses_total",
      help: "Permission cache Redis misses (recomputed from roles)",
      registers: [register],
    });
  }
  if (!invalidations) {
    invalidations = new Counter({
      name: "rbac_permission_cache_invalidations_total",
      help: "Permission cache key invalidations",
      registers: [register],
    });
  }
}

export function recordPermissionCacheHit(): void {
  hits?.inc();
}

export function recordPermissionCacheMiss(): void {
  misses?.inc();
}

export function recordPermissionCacheInvalidation(count = 1): void {
  if (count > 0) {
    invalidations?.inc(count);
  }
}
