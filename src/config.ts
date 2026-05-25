/**
 * Frontend runtime config (Vite `import.meta.env`).
 * WebSocket uses same origin in dev so Vite can proxy `/socket.io` to the API server.
 */
function resolveWsUrl(): string {
  const explicit = import.meta.env.VITE_WS_URL;
  if (explicit && explicit.length > 0) {
    return explicit;
  }
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'http://localhost:3000';
}

export const config = {
  wsUrl: resolveWsUrl(),
  socketPath: '/socket.io',
} as const;
