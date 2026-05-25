import { lazy } from 'react';

/** Route-level lazy imports (code splitting). */
export const LoginPage = lazy(() => import('@/pages/Login'));
export const DashboardPage = lazy(() => import('@/pages/Dashboard'));
export const AgentsPage = lazy(() => import('@/pages/Agents'));
export const SignalsPage = lazy(() => import('@/pages/Signals'));
export const SettingsPage = lazy(() => import('@/pages/Settings'));
export const PerformancePage = lazy(() => import('@/pages/Performance'));

const prefetchers = {
  login: () => import('@/pages/Login'),
  dashboard: () => import('@/pages/Dashboard'),
  agents: () => import('@/pages/Agents'),
  signals: () => import('@/pages/Signals'),
  settings: () => import('@/pages/Settings'),
  performance: () => import('@/pages/Performance'),
} as const;

export type PrefetchableRoute = keyof typeof prefetchers;

/** Warm the chunk for a route (e.g. on sidebar hover). */
export function prefetchRoute(route: PrefetchableRoute): void {
  void prefetchers[route]();
}

const pathToPrefetch: Record<string, PrefetchableRoute> = {
  '/dashboard': 'dashboard',
  '/usage': 'dashboard',
  '/portfolio': 'dashboard',
  '/agents': 'agents',
  '/agent-registry': 'agents',
  '/my-agents': 'agents',
  '/action-queue': 'signals',
  '/signals': 'signals',
  '/settings': 'settings',
  '/settings/mfa-policy': 'settings',
  '/settings/retention': 'settings',
  '/performance': 'performance',
  '/platform-health': 'performance',
};

export function prefetchRouteForPath(path: string): void {
  const key = pathToPrefetch[path];
  if (key) {
    prefetchRoute(key);
  }
}
