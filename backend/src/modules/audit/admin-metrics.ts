import { Counter, type Registry } from "prom-client";

let criticalCounter: Counter | undefined;

export function registerAdminMetrics(register: Registry): void {
  if (!criticalCounter) {
    criticalCounter = new Counter({
      name: "admin_critical_action_total",
      help: "Critical admin configuration changes (SSO, API keys, roles, billing).",
      labelNames: ["action"],
      registers: [register],
    });
  }
}

export function recordAdminCriticalAction(action: string): void {
  criticalCounter?.labels(action).inc();
}
