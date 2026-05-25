import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NOTIFICATION_PREFERENCES_KEY,
  type NotificationPreferences,
} from '@/types/notifications';

export function loadNotificationPreferences(): NotificationPreferences {
  try {
    const raw = localStorage.getItem(NOTIFICATION_PREFERENCES_KEY);
    if (!raw) {
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }
    const parsed = JSON.parse(raw) as Partial<NotificationPreferences>;
    return {
      toastEnabled: parsed.toastEnabled ?? DEFAULT_NOTIFICATION_PREFERENCES.toastEnabled,
      soundEnabled: parsed.soundEnabled ?? DEFAULT_NOTIFICATION_PREFERENCES.soundEnabled,
      browserEnabled: parsed.browserEnabled ?? DEFAULT_NOTIFICATION_PREFERENCES.browserEnabled,
    };
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

export function saveNotificationPreferences(prefs: NotificationPreferences): void {
  localStorage.setItem(NOTIFICATION_PREFERENCES_KEY, JSON.stringify(prefs));
}
