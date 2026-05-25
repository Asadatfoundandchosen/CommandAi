import type { MfaAllowedMethod, MfaRequiredFor } from "./mfa-policy.model.js";

export const DEFAULT_ALLOWED_METHODS: MfaAllowedMethod[] = ["totp", "sms"];

/** UTC calendar-day addition for grace period end. */
export function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function gracePeriodEnd(enforcementDate: Date, gracePeriodDays: number): Date {
  return addUtcDays(enforcementDate, gracePeriodDays);
}

export function roleRequiresMfaPolicy(
  role: string,
  requiredFor: MfaRequiredFor,
): boolean {
  if (requiredFor === "none") {
    return false;
  }
  if (requiredFor === "all") {
    return true;
  }
  return role.includes("admin");
}

export type MfaComplianceUser = {
  mfa_enabled?: boolean;
  mfa?: { sms_enabled?: boolean };
};

/** True when the user has at least one allowed MFA method enabled. */
export function userSatisfiesMfaPolicy(
  user: MfaComplianceUser,
  allowedMethods: MfaAllowedMethod[],
): boolean {
  if (allowedMethods.includes("totp") && user.mfa_enabled) {
    return true;
  }
  if (allowedMethods.includes("sms") && user.mfa?.sms_enabled) {
    return true;
  }
  return false;
}

export function daysRemainingUntil(target: Date, now = new Date()): number {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) {
    return 0;
  }
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function isGracePeriodActive(
  enforcementDate: Date,
  gracePeriodDays: number,
  now = new Date(),
): boolean {
  const end = gracePeriodEnd(enforcementDate, gracePeriodDays);
  return now <= end;
}

export function isEnforcementBlocking(
  enforcementDate: Date,
  gracePeriodDays: number,
  now = new Date(),
): boolean {
  return now > gracePeriodEnd(enforcementDate, gracePeriodDays);
}
