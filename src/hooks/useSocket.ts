import { useEffect, useRef } from 'react';

import { socketService } from '@/services/socket';

/**
 * Subscribe to a Socket.io event channel. Uses a stable handler ref so callers
 * are not forced to memoize callbacks.
 */
export function useSocket<T>(channel: string, handler: (data: T) => void): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    const wrapped = (data: unknown) => {
      handlerRef.current(data as T);
    };
    socketService.subscribe(channel, wrapped);
    return () => {
      socketService.unsubscribe(channel, wrapped);
    };
  }, [channel]);
}
