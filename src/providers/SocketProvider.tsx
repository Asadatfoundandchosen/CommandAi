import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { socketService } from '@/services/socket';
import { useAppSelector } from '@/store/hooks';

type SocketProviderProps = {
  children: ReactNode;
};

/**
 * Connects Socket.io when JWT + orgId are present; disconnects on logout.
 */
export function SocketProvider({ children }: SocketProviderProps) {
  const token = useAppSelector((s) => s.auth.token);
  const orgId = useAppSelector((s) => s.auth.orgId);

  useEffect(() => {
    if (!token || !orgId) {
      socketService.disconnect();
      return;
    }

    socketService.connect({ token, orgId });
    return () => {
      socketService.disconnect();
    };
  }, [token, orgId]);

  return children;
}
