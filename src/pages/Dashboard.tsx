import { PageHeader } from '@/components/layout';
import { UsageDashboard } from '@/components/UsageDashboard';

/** Org usage & credits dashboard (lazy route). */
export default function Dashboard() {
  return (
    <>
      <PageHeader title="Usage" description="Credits, allocation, and trends" />
      <UsageDashboard />
    </>
  );
}
