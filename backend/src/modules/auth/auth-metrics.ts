import { Counter, type Registry } from "prom-client";

let reuseCounter: Counter | undefined;
let lockoutCounter: Counter | undefined;

export function registerAuthMetrics(register: Registry): void {
  if (!reuseCounter) {
    reuseCounter = new Counter({
      name: "auth_refresh_token_reuse_total",
      help: "Refresh token reuse detected (potential theft); all user refresh tokens invalidated.",
      registers: [register],
    });
  }
  if (!lockoutCounter) {
    lockoutCounter = new Counter({
      name: "auth_account_lockout_total",
      help: "Accounts locked after repeated failed login attempts (brute-force protection).",
      registers: [register],
    });
  }
}

export function recordRefreshTokenReuse(): void {
  reuseCounter?.inc();
}

export function recordAccountLockout(): void {
  lockoutCounter?.inc();
}
