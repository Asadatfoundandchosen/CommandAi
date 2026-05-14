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
