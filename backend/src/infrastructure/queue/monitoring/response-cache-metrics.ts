import { Counter, type Registry } from "prom-client";

let hitCounter: Counter | undefined;
let missCounter: Counter | undefined;
let bypassCounter: Counter | undefined;

export function registerResponseCacheMetrics(register: Registry): void {
  if (hitCounter) {
    return;
  }
  hitCounter = new Counter({
    name: "http_response_cache_hits_total",
    help: "GET response cache HITs (cache-aside, Redis).",
    registers: [register],
  });
  missCounter = new Counter({
    name: "http_response_cache_misses_total",
    help: "GET response cache MISSes before store.",
    registers: [register],
  });
  bypassCounter = new Counter({
    name: "http_response_cache_bypass_total",
    help: "GET requests that skipped cache due to X-Cache-Bypass.",
    registers: [register],
  });
}

export function recordResponseCacheHit(): void {
  hitCounter?.inc();
}
export function recordResponseCacheMiss(): void {
  missCounter?.inc();
}
export function recordResponseCacheBypass(): void {
  bypassCounter?.inc();
}
