import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { toast } from 'sonner';

import { store } from '@/store';
import {
  recordWebVital,
  type WebVitalName,
  type WebVitalRating,
} from '@/store/slices/webVitalsSlice';

import { track } from './analytics';
import {
  isBudgetViolation,
  PERFORMANCE_BUDGETS,
  type BudgetMetricName,
} from './performance-budgets';

export { isBudgetViolation, PERFORMANCE_BUDGETS };
export type { BudgetMetricName };

const alertedIds = new Set<string>();

function formatMetricValue(name: string, value: number): string {
  if (name === 'CLS') return value.toFixed(3);
  return `${Math.round(value)}ms`;
}

function toStoreName(name: string): WebVitalName {
  if (name === 'INP') return 'INP';
  return name as WebVitalName;
}

function alertBudgetViolation(metric: Metric, budgetExceeded: boolean): void {
  if (!budgetExceeded && metric.rating !== 'poor') return;
  if (alertedIds.has(metric.id)) return;
  alertedIds.add(metric.id);

  const label = formatMetricValue(metric.name, metric.value);
  const reason = budgetExceeded ? 'exceeds performance budget' : 'rated poor';
  console.warn(`[Web Vitals] ${metric.name} ${reason}: ${label}`);

  toast.error(`Performance: ${metric.name} ${reason}`, {
    description: `${label} — see Performance dashboard`,
    duration: 6000,
  });
}

function handleMetric(metric: Metric): void {
  const budgetExceeded = isBudgetViolation(metric);
  const storeName = toStoreName(metric.name);

  track('web_vital', {
    name: metric.name,
    value: metric.value,
    rating: metric.rating,
    delta: metric.delta,
    id: metric.id,
    budget_exceeded: budgetExceeded,
  });

  store.dispatch(
    recordWebVital({
      id: metric.id,
      name: storeName,
      value: metric.value,
      rating: metric.rating as WebVitalRating,
      delta: metric.delta,
      navigationType: metric.navigationType,
      recordedAt: new Date().toISOString(),
      budgetExceeded,
    }),
  );

  if (metric.rating === 'poor') {
    console.warn(`Poor ${metric.name}: ${formatMetricValue(metric.name, metric.value)}`);
  }

  alertBudgetViolation(metric, budgetExceeded);
}

/**
 * Register Core Web Vitals + paint/navigation observers.
 * Call once at app startup (after Redux store exists).
 */
export function reportWebVitals(): void {
  onCLS(handleMetric);
  onINP(handleMetric);
  onLCP(handleMetric);
  onFCP(handleMetric);
  onTTFB(handleMetric);
}

export function getPerformanceBudgets(): typeof PERFORMANCE_BUDGETS {
  return PERFORMANCE_BUDGETS;
}
