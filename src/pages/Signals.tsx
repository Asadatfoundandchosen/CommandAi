import { lazy } from 'react';

import { PageHeader } from '@/components/layout';
import { PageSuspense } from '@/components/layout/PageSuspense';

const RateLimitDashboard = lazy(() =>
  import('@/components/RateLimitDashboard').then((m) => ({ default: m.RateLimitDashboard })),
);

/** Signals & operational queues (lazy route). */
export default function Signals() {
  return (
    <>
      <PageHeader title="Signals" description="Rate limits, queues, and live events" />
      <PageSuspense label="Loading signals…">
        <RateLimitDashboard
          adminToken={import.meta.env.VITE_QUEUE_ADMIN_TOKEN ?? ''}
        />
      </PageSuspense>
    </>
  );
}
