type AnalyticsValue = string | number | boolean | undefined;

export type AnalyticsProperties = Record<string, AnalyticsValue>;

type AnalyticsPayload = {
  event: string;
  properties?: AnalyticsProperties;
  ts: number;
  url: string;
};

/**
 * Lightweight client analytics — sends events via `sendBeacon` (falls back to `fetch`).
 * Backend may implement `POST /api/v1/analytics/events`; failures are non-blocking.
 */
export function track(event: string, properties?: AnalyticsProperties): void {
  const payload: AnalyticsPayload = {
    event,
    properties,
    ts: Date.now(),
    url: typeof window !== 'undefined' ? window.location.pathname : '',
  };

  if (import.meta.env.DEV) {
    console.debug('[analytics]', event, properties);
  }

  const endpoint =
    import.meta.env.VITE_ANALYTICS_ENDPOINT ?? '/api/v1/analytics/events';
  const body = JSON.stringify(payload);

  if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
    const ok = navigator.sendBeacon(
      endpoint,
      new Blob([body], { type: 'application/json' }),
    );
    if (ok) return;
  }

  void fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    credentials: 'include',
    keepalive: true,
  }).catch(() => {
    /* analytics must not break the app */
  });
}
