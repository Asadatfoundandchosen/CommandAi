import { useSocketConnection } from '@/hooks/useSocketConnection';
import { cn } from '@/lib/utils';

export function SocketConnectionStatus() {
  const connected = useSocketConnection();

  return (
    <div
      className="flex items-center gap-2 text-xs text-muted-foreground"
      title={connected ? 'Real-time connected' : 'Real-time disconnected'}
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          connected ? 'bg-emerald-500' : 'bg-muted-foreground/50',
        )}
        aria-hidden
      />
      <span>{connected ? 'Live' : 'Offline'}</span>
    </div>
  );
}
