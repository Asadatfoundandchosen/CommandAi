import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

type LoadingSpinnerProps = {
  label?: string;
  fullPage?: boolean;
  className?: string;
};

export function LoadingSpinner({
  label = 'Loading…',
  fullPage = false,
  className,
}: LoadingSpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex flex-col items-center justify-center gap-3 text-muted-foreground',
        fullPage && 'min-h-[40vh] w-full',
        className,
      )}
    >
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden />
      <span className="text-sm">{label}</span>
    </div>
  );
}
