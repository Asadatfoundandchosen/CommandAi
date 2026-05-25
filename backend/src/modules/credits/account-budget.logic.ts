/** Percent of allocated credits consumed (0–100). */
export function budgetPercentUsed(allocated: number, used: number): number {
  if (allocated <= 0) {
    return 0;
  }
  return Math.min(100, (used / allocated) * 100);
}

/** True when usage has reached the configured warning threshold. */
export function isBudgetWarningActive(
  allocated: number,
  used: number,
  warningThreshold: number,
): boolean {
  return budgetPercentUsed(allocated, used) >= warningThreshold;
}
