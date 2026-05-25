import { isBudgetViolation, PERFORMANCE_BUDGETS } from './performance-budgets';

describe('performance budgets', () => {
  it('flags LCP over 2.5s', () => {
    expect(isBudgetViolation({ name: 'LCP', value: 3000 })).toBe(true);
    expect(isBudgetViolation({ name: 'LCP', value: 2000 })).toBe(false);
  });

  it('flags INP over 100ms (FID budget)', () => {
    expect(isBudgetViolation({ name: 'INP', value: 150 })).toBe(true);
    expect(isBudgetViolation({ name: 'INP', value: 80 })).toBe(false);
  });

  it('flags CLS over 0.1', () => {
    expect(isBudgetViolation({ name: 'CLS', value: 0.15 })).toBe(true);
    expect(isBudgetViolation({ name: 'CLS', value: 0.05 })).toBe(false);
  });

  it('exposes documented budgets', () => {
    expect(PERFORMANCE_BUDGETS.LCP).toBe(2500);
    expect(PERFORMANCE_BUDGETS.FID).toBe(100);
    expect(PERFORMANCE_BUDGETS.CLS).toBe(0.1);
  });
});
