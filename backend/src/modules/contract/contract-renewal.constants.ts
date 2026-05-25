/** Days before `end_date` to send renewal reminders and begin renewal window. */
export const RENEWAL_WINDOW_DAYS = 30;

/** Reminder thresholds (calendar days until `end_date`). */
export const RENEWAL_REMINDER_DAYS = [30, 7, 0] as const;

export const RENEWAL_MAX_ATTEMPTS = 3;

export const RENEWAL_GRACE_PERIOD_DAYS = 7;

export const CONTRACT_RENEWAL_DAILY_SCAN_JOB = "contract-renewal-daily-scan";

export const CONTRACT_RENEWAL_REMINDER_TEMPLATE = "contract-renewal-reminder";

export const CONTRACT_RENEWAL_SUCCESS_TEMPLATE = "contract-renewal-success";

export const CONTRACT_RENEWAL_FAILED_ADMIN_TEMPLATE = "contract-renewal-failed-admin";

export const CONTRACT_RENEWAL_GRACE_SUSPEND_TEMPLATE = "contract-renewal-grace-suspend";
