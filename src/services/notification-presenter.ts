import { toast } from 'sonner';

import { playNotificationSound } from '@/lib/notification-sound';
import { showBrowserNotification } from '@/lib/browser-notifications';
import type { AppNotification, NotificationPreferences } from '@/types/notifications';

export function presentNotification(
  notification: AppNotification,
  preferences: NotificationPreferences,
  onView?: (url: string) => void,
): void {
  if (preferences.toastEnabled) {
    const action =
      notification.url && onView
        ? {
            label: 'View',
            onClick: () => onView(notification.url!),
          }
        : undefined;

    switch (notification.type) {
      case 'approval_needed':
        toast.warning(notification.title, {
          description: notification.message,
          action,
        });
        break;
      case 'success':
        toast.success(notification.title, { description: notification.message, action });
        break;
      case 'error':
        toast.error(notification.title, { description: notification.message, action });
        break;
      default:
        toast.info(notification.title, { description: notification.message, action });
        break;
    }
  }

  if (preferences.soundEnabled) {
    playNotificationSound();
  }

  if (preferences.browserEnabled) {
    showBrowserNotification('1CommandAI', {
      body: notification.message,
      tag: notification.id,
    });
  }
}
