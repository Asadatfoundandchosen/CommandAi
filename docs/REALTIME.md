# Real-time updates (Socket.io client)

The frontend connects to the API **Socket.io** server (same HTTP server as Express) for per-tenant events bridged from Redis pub/sub.

## Configuration

| Variable | Default |
|----------|---------|
| `VITE_WS_URL` | Browser `window.location.origin` (Vite dev proxies `/socket.io` → API) |
| Path | `/socket.io` |

See `src/config.ts` and `.env.example`.

## Architecture

```text
Redis PUBLISH (org:signals|approvals|notifications)
  → API subscriber
  → Socket.io emit to room org:{orgId}
  → socket.io-client in browser
```

**Handshake auth** (required by API MVP): `{ token, orgId }`. `orgId` is extracted from the JWT `org_id` claim on login/refresh (`src/lib/jwt.ts`).

## Usage

### Service (`src/services/socket.ts`)

```typescript
import { socketService } from '@/services/socket';

socketService.connect({ token, orgId });
socketService.subscribe('signals', (payload) => { /* ... */ });
socketService.unsubscribe('signals', handler);
socketService.disconnect();
```

Reconnection: enabled (`reconnectionDelay: 1000`, `reconnectionAttempts: 10`) with console logging for `connect`, `disconnect`, `connect_error`, and `reconnect_*`.

### Hook (`src/hooks/useSocket.ts`)

```typescript
import { useSocket } from '@/hooks/useSocket';
import { RealtimeEvents } from '@/types/realtime';
import type { SignalRealtimePayload } from '@/types/realtime';

useSocket(RealtimeEvents.SIGNALS, (data: SignalRealtimePayload) => {
  console.log('signal', data);
});
```

### App wiring

`SocketProvider` (`src/providers/SocketProvider.tsx`) in `main.tsx` connects when `auth.token` + `auth.orgId` are set.

`NotificationProvider` (`src/components/notifications/NotificationProvider.tsx`) handles toasts, notification center, sound, and browser alerts — see **`docs/NOTIFICATIONS.md`**.

### Event types

| Socket event | Payload type | Handler |
|--------------|--------------|---------|
| `signals` | `SignalRealtimePayload` | Toast + invalidate `Signal` LIST tag |
| `approvals` | `ApprovalRealtimePayload` | Toast |
| `notifications` | `NotificationRealtimePayload` | Toast by severity |

Defined in `src/types/realtime.ts` (aligned with `backend/src/infrastructure/pubsub/schemas.ts`).

## Local development

```bash
npm run backend:dev   # API + Socket.io on :3000
npm run frontend:dev  # Vite :5173, proxies /api and /socket.io
```

Ensure `WEBSOCKET_ENABLED` is true on the API (default).

## Production

Set `VITE_WS_URL` to the public API origin (e.g. `https://api.example.com`). TLS terminates at the load balancer; use `wss` when the page is served over HTTPS (Socket.io negotiates automatically).
