/** In-app notification kinds (toast + notification center). */
export type NotificationKind =
  | 'approval_needed'
  | 'success'
  | 'error'
  | 'info'
  | 'signal'
  | 'approval';

export type AppNotification = {
  id: string;
  type: NotificationKind;
  title: string;
  message: string;
  url?: string;
  read: boolean;
  createdAt: string;
};

export type NotificationPreferences = {
  toastEnabled: boolean;
  soundEnabled: boolean;
  browserEnabled: boolean;
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  toastEnabled: true,
  soundEnabled: true,
  browserEnabled: false,
};

export const NOTIFICATION_PREFERENCES_KEY = '1cmd:notification-preferences';
