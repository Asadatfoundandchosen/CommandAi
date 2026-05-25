import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { requestBrowserNotificationPermission } from '@/lib/browser-notifications';
import {
  loadNotificationPreferences,
  saveNotificationPreferences,
} from '@/lib/notification-preferences-storage';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { setNotificationPreferences } from '@/store/slices/notificationsSlice';
import type { NotificationPreferences } from '@/types/notifications';

type NotificationPreferencesPanelProps = {
  onClose?: () => void;
};

export function NotificationPreferencesPanel({ onClose }: NotificationPreferencesPanelProps) {
  const dispatch = useAppDispatch();
  const stored = useAppSelector((s) => s.notifications.preferences);
  const [draft, setDraft] = useState<NotificationPreferences>(stored);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  );

  useEffect(() => {
    setDraft(loadNotificationPreferences());
  }, []);

  const save = () => {
    dispatch(setNotificationPreferences(draft));
    saveNotificationPreferences(draft);
    onClose?.();
  };

  const enableBrowser = async () => {
    const permission = await requestBrowserNotificationPermission();
    setBrowserPermission(permission);
    if (permission === 'granted') {
      setDraft((d) => ({ ...d, browserEnabled: true }));
    }
  };

  return (
    <div className="space-y-4 p-2">
      <p className="text-sm font-medium">Notification preferences</p>
      <label className="flex items-center justify-between gap-4 text-sm">
        <span>Toast alerts</span>
        <input
          type="checkbox"
          checked={draft.toastEnabled}
          onChange={(e) => setDraft((d) => ({ ...d, toastEnabled: e.target.checked }))}
        />
      </label>
      <label className="flex items-center justify-between gap-4 text-sm">
        <span>Sound</span>
        <input
          type="checkbox"
          checked={draft.soundEnabled}
          onChange={(e) => setDraft((d) => ({ ...d, soundEnabled: e.target.checked }))}
        />
      </label>
      <div className="space-y-2">
        <label className="flex items-center justify-between gap-4 text-sm">
          <span>Browser notifications</span>
          <input
            type="checkbox"
            checked={draft.browserEnabled}
            disabled={browserPermission === 'denied' || browserPermission === 'unsupported'}
            onChange={(e) => setDraft((d) => ({ ...d, browserEnabled: e.target.checked }))}
          />
        </label>
        {browserPermission !== 'granted' && browserPermission !== 'unsupported' ? (
          <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => void enableBrowser()}>
            Enable browser permission
          </Button>
        ) : null}
        {browserPermission === 'denied' ? (
          <p className="text-xs text-muted-foreground">Blocked in browser settings.</p>
        ) : null}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}
