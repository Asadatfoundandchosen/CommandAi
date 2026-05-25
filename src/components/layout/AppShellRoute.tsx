import type { ReactNode } from 'react';

import { AppShell } from '@/components/layout/app-shell';
import { PageSuspense } from '@/components/layout/PageSuspense';

type AppShellRouteProps = {
  children: ReactNode;
  loadingLabel?: string;
};

/** Authenticated layout with per-route Suspense for lazy pages. */
export function AppShellRoute({ children, loadingLabel = 'Loading page…' }: AppShellRouteProps) {
  return (
    <AppShell>
      <PageSuspense label={loadingLabel}>{children}</PageSuspense>
    </AppShell>
  );
}
