import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { PageHeader } from '@/components/layout';
import { PageSuspense } from '@/components/layout/PageSuspense';

const SettingsHome = lazy(() => import('@/pages/SettingsHome'));
const MfaPolicyAdmin = lazy(() =>
  import('@/components/MfaPolicyAdmin').then((m) => ({ default: m.MfaPolicyAdmin })),
);
const RetentionPolicyAdmin = lazy(() =>
  import('@/components/RetentionPolicyAdmin').then((m) => ({ default: m.RetentionPolicyAdmin })),
);

/** Settings shell with nested lazy admin panels. */
export default function Settings() {
  return (
    <>
      <PageHeader title="Settings" description="Organization security and compliance" />
      <PageSuspense label="Loading settings…">
        <Routes>
          <Route index element={<SettingsHome />} />
          <Route path="mfa-policy" element={<MfaPolicyAdmin />} />
          <Route path="retention" element={<RetentionPolicyAdmin />} />
          <Route path="*" element={<Navigate to="/settings" replace />} />
        </Routes>
      </PageSuspense>
    </>
  );
}
