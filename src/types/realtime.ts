/** Socket.io event names emitted by the API (`socket-bridge.ts` → `envelope.type`). */
export const RealtimeEvents = {
  SIGNALS: 'signals',
  APPROVALS: 'approvals',
  NOTIFICATIONS: 'notifications',
} as const;

export type RealtimeEventName = (typeof RealtimeEvents)[keyof typeof RealtimeEvents];

export type SignalRealtimePayload = {
  id: string;
  kind: string;
  data?: Record<string, unknown>;
};

export type ApprovalRealtimePayload = {
  id: string;
  resource: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy?: string;
};

export type NotificationRealtimePayload = {
  id: string;
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'critical';
  meta?: Record<string, unknown>;
};
