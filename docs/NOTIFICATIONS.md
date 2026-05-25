# Real-time notifications

Users receive **immediate** alerts for org-scoped events via Socket.io, with **toast** (Sonner), an in-app **notification center**, optional **sound**, and optional **browser** notifications.

## Components

| Path | Role |
|------|------|
| `src/components/notifications/NotificationProvider.tsx` | Socket listeners → Redux + present (toast/sound/browser) |
| `src/components/notifications/NotificationCenter.tsx` | Bell dropdown, unread badge, mark read |
| `src/components/notifications/NotificationPreferencesPanel.tsx` | Toast / sound / browser toggles (localStorage) |
| `src/components/notifications/SocketConnectionStatus.tsx` | Live / Offline indicator |

## Socket events

Aligned with API (`notifications`, `approvals`, `signals` — not a single `notification` channel):

| Event | Maps to |
|-------|---------|
| `notifications` | `info` / `approval_needed` / `error` from severity |
| `approvals` | `approval_needed` / `success` / `error` from status |
| `signals` | `signal` + RTK cache invalidation |

## Preferences

Stored in **localStorage** (`1cmd:notification-preferences`):

- `toastEnabled` (default: true)
- `soundEnabled` (default: true)
- `browserEnabled` (default: false) — requires `Notification.requestPermission()`

## Notification center

- Header **bell** with unread count
- Click item → mark read + navigate if `url` set
- **Mark all read**
- **Preferences** inline in dropdown

## Redux

`notifications` slice: `items[]`, `preferences`, actions `addNotification`, `markNotificationRead`, `markAllNotificationsRead`, `clearNotifications`.

## Usage

Mounted in `main.tsx` inside `BrowserRouter`:

```tsx
<NotificationProvider>
  <App />
</NotificationProvider>
```

`NotificationCenter` + `SocketConnectionStatus` appear in `AppShell` header (authenticated routes).

See also **`docs/REALTIME.md`** for Socket.io connection details.
