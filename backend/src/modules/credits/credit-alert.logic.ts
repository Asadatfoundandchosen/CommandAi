import type { CreditAlertThreshold } from "./credit-alert.constants.js";

/** Most severe = lowest percent threshold still crossed. */
export function resolveMostSevereThreshold(
  percentRemaining: number,
  thresholds: CreditAlertThreshold[],
): CreditAlertThreshold | undefined {
  const crossed = thresholds
    .filter((t) => percentRemaining <= t.percent)
    .sort((a, b) => a.percent - b.percent);
  return crossed[0];
}
