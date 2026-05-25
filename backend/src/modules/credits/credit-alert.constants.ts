export type CreditAlertLevel = "warning" | "critical" | "urgent";

export type CreditAlertThreshold = {
  percent: number;
  level: CreditAlertLevel;
};

/** Default low-balance thresholds (percent of allocation remaining). */
export const DEFAULT_ALERT_THRESHOLDS: CreditAlertThreshold[] = [
  { percent: 25, level: "warning" },
  { percent: 10, level: "critical" },
  { percent: 5, level: "urgent" },
];

/** Hysteresis above highest threshold before clearing sent-state. */
export const CREDIT_ALERT_RESET_BUFFER_PERCENT = 5;

export const ORG_SETTINGS_CREDIT_ALERT_THRESHOLDS = "credit_alert_thresholds";
export const ORG_SETTINGS_NOTIFICATION_PREFERENCES = "notification_preferences";
export const ORG_SETTINGS_CREDIT_ALERT_STATE = "credit_alert_state";

export const CREDIT_ALERT_TEMPLATE_ID = "credit-low-balance";

export type CreditNotificationPreferences = {
  credit_alerts_enabled: boolean;
  email_enabled: boolean;
  in_app_enabled: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: CreditNotificationPreferences = {
  credit_alerts_enabled: true,
  email_enabled: true,
  in_app_enabled: true,
};

export type CreditAlertState = {
  /** Levels already notified until balance recovers. */
  sent_levels: CreditAlertLevel[];
  last_percent_remaining?: number;
  last_checked_at?: string;
};
