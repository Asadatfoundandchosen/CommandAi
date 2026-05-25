import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

import { useSocket } from '@/hooks/useSocket';
import { loadNotificationPreferences } from '@/lib/notification-preferences-storage';
import {
  fromApprovalChannel,
  fromNotificationChannel,
  fromSignalChannel,
} from '@/services/notification-mappers';
import { presentNotification } from '@/services/notification-presenter';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { api } from '@/store/api';
import {
  addNotification,
  hydrateNotificationPreferences,
} from '@/store/slices/notificationsSlice';
import type { AppNotification } from '@/types/notifications';
import type {
  ApprovalRealtimePayload,
  NotificationRealtimePayload,
  SignalRealtimePayload,
} from '@/types/realtime';
import { RealtimeEvents } from '@/types/realtime';

type NotificationProviderProps = {
  children: ReactNode;
};

export function NotificationProvider({ children }: NotificationProviderProps) {
  const dispatch = useAppDispatch();
  const token = useAppSelector((s) => s.auth.token);

  useEffect(() => {
    dispatch(hydrateNotificationPreferences(loadNotificationPreferences()));
  }, [dispatch]);

  return (
    <>
      {children}
      {token ? <RealtimeNotificationListeners /> : null}
    </>
  );
}

function RealtimeNotificationListeners() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const preferences = useAppSelector((s) => s.notifications.preferences);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;

  const ingest = useCallback(
    (notification: AppNotification) => {
      dispatch(addNotification(notification));
      presentNotification(notification, preferencesRef.current, (url) => navigate(url));
    },
    [dispatch, navigate],
  );

  const onNotifications = useCallback(
    (data: NotificationRealtimePayload) => {
      ingest(fromNotificationChannel(data));
    },
    [ingest],
  );

  const onApprovals = useCallback(
    (data: ApprovalRealtimePayload) => {
      ingest(fromApprovalChannel(data));
    },
    [ingest],
  );

  const onSignals = useCallback(
    (data: SignalRealtimePayload) => {
      dispatch(api.util.invalidateTags([{ type: 'Signal', id: 'LIST' }]));
      ingest(fromSignalChannel(data));
    },
    [dispatch, ingest],
  );

  useSocket(RealtimeEvents.NOTIFICATIONS, onNotifications);
  useSocket(RealtimeEvents.APPROVALS, onApprovals);
  useSocket(RealtimeEvents.SIGNALS, onSignals);

  return null;
}
