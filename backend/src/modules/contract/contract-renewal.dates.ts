import type { BillingCycle } from "./contract.model.js";

/** Extend contract term from `periodStart` by billing cycle. */
export function addBillingPeriod(periodStart: Date, cycle: BillingCycle): Date {
  const d = new Date(periodStart.getTime());
  if (cycle === "annual") {
    d.setUTCFullYear(d.getUTCFullYear() + 1);
  } else {
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return d;
}

export function addDaysUtc(date: Date, days: number): Date {
  const d = new Date(date.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
