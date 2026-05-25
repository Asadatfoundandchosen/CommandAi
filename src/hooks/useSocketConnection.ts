import { useEffect, useState } from 'react';

import { socketService } from '@/services/socket';

export function useSocketConnection(): boolean {
  const [connected, setConnected] = useState(socketService.connected);

  useEffect(() => {
    return socketService.onConnectionChange(setConnected);
  }, []);

  return connected;
}
