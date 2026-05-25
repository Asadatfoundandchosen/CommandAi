import type { AppNotification, NotificationKind } from '@/types/notifications';
import type {
  ApprovalRealtimePayload,
  NotificationRealtimePayload,
  SignalRealtimePayload,
} from '@/types/realtime';

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function fromNotificationChannel(payload: NotificationRealtimePayload): AppNotification {
  const type: NotificationKind =
    payload.severity === 'critical'
      ? 'error'
      : payload.severity === 'warning'
        ? 'approval_needed'
        : 'info';

  const url =
    typeof payload.meta?.url === 'string'
      ? payload.meta.url
      : typeof payload.meta?.path === 'string'
        ? payload.meta.path
        : undefined;

  return {
    id: payload.id || newId('notification'),
    type,
    title: payload.title,
    message: payload.body,
    url,
    read: false,
    createdAt: new Date().toISOString(),
  };
}

export function fromApprovalChannel(payload: ApprovalRealtimePayload): AppNotification {
  const type: NotificationKind =
    payload.status === 'approved'
      ? 'success'
      : payload.status === 'rejected'
        ? 'error'
        : 'approval_needed';

  return {
    id: payload.id || newId('approval'),
    type,
    title: 'Approval update',
    message: `${payload.resource} — ${payload.status}`,
    url: payload.status === 'pending' ? '/action-queue' : undefined,
    read: false,
    createdAt: new Date().toISOString(),
  };
}

export function fromSignalChannel(payload: SignalRealtimePayload): AppNotification {
  return {
    id: payload.id || newId('signal'),
    type: 'signal',
    title: 'New signal',
    message: `${payload.kind} · ${payload.id}`,
    url: '/agent-registry',
    read: false,
    createdAt: new Date().toISOString(),
  };
}
