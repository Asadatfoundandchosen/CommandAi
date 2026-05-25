/** Performance budgets (Core Web Vitals + paint/navigation). */
export const PERFORMANCE_BUDGETS = {
  LCP: 2500,
  /** Legacy FID budget; INP is the modern interaction metric (same threshold here). */
  FID: 100,
  INP: 100,
  CLS: 0.1,
  FCP: 1800,
  TTFB: 800,
} as const;

export type BudgetMetricName = keyof typeof PERFORMANCE_BUDGETS;

export function getBudgetForMetric(name: string): number | undefined {
  if (name in PERFORMANCE_BUDGETS) {
    return PERFORMANCE_BUDGETS[name as BudgetMetricName];
  }
  return undefined;
}

/** True when measured value exceeds the configured performance budget. */
export function isBudgetViolation(metric: { name: string; value: number }): boolean {
  const budget = getBudgetForMetric(metric.name);
  if (budget === undefined) return false;
  return metric.value > budget;
}
