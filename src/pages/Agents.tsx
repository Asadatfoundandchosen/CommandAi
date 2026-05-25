import { lazy } from 'react';

import { PageHeader } from '@/components/layout';
import { PageSuspense } from '@/components/layout/PageSuspense';

const RoleHierarchyAdmin = lazy(() =>
  import('@/components/RoleHierarchyAdmin').then((m) => ({ default: m.RoleHierarchyAdmin })),
);

/** Agent & role management area (lazy route + nested chunk). */
export default function Agents() {
  return (
    <>
      <PageHeader title="Agents" description="Registry, roles, and hierarchy" />
      <PageSuspense label="Loading agents…">
        <RoleHierarchyAdmin />
      </PageSuspense>
    </>
  );
}
