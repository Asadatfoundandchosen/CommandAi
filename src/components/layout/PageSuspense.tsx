import type { ReactNode } from 'react';
import { Suspense } from 'react';

import { LoadingSpinner } from '@/components/layout/LoadingSpinner';

type PageSuspenseProps = {
  children: ReactNode;
  label?: string;
};

/** Nested Suspense boundary for lazy-loaded page sections. */
export function PageSuspense({ children, label }: PageSuspenseProps) {
  return <Suspense fallback={<LoadingSpinner label={label} />}>{children}</Suspense>;
}
