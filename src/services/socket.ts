import { io, type Socket } from 'socket.io-client';

import { config } from '@/config';

export type SocketConnectOptions = {
  token: string;
  orgId: string;
};

type EventHandler = (data: unknown) => void;
type ConnectionListener = (connected: boolean) => void;

class SocketService {
  private socket: Socket | null = null;
  private connectionListeners = new Set<ConnectionListener>();

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }

  onConnectionChange(listener: ConnectionListener): () => void {
    this.connectionListeners.add(listener);
    listener(this.connected);
    return () => {
      this.connectionListeners.delete(listener);
    };
  }

  private emitConnection(connected: boolean): void {
    for (const listener of this.connectionListeners) {
      listener(connected);
    }
  }

  connect(options: SocketConnectOptions): void {
    if (this.socket?.connected) {
      return;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.socket = io(config.wsUrl, {
      path: config.socketPath,
      auth: {
        token: options.token,
        orgId: options.orgId,
      },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.info('[socket] connected', { id: this.socket?.id });
      this.emitConnection(true);
    });

    this.socket.on('disconnect', (reason) => {
      console.info('[socket] disconnected', reason);
      this.emitConnection(false);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[socket] connect_error', error.message);
    });

    this.socket.on('error', (error: Error) => {
      console.error('[socket] error', error);
    });

    this.socket.io.on('reconnect_attempt', (attempt) => {
      console.info('[socket] reconnect_attempt', attempt);
    });

    this.socket.io.on('reconnect', (attempt) => {
      console.info('[socket] reconnected', attempt);
    });

    this.socket.io.on('reconnect_failed', () => {
      console.error('[socket] reconnection failed after max attempts');
    });
  }

  subscribe(channel: string, handler: EventHandler): void {
    this.socket?.on(channel, handler);
  }

  unsubscribe(channel: string, handler?: EventHandler): void {
    if (handler) {
      this.socket?.off(channel, handler);
      return;
    }
    this.socket?.off(channel);
  }

  disconnect(): void {
    if (!this.socket) {
      this.emitConnection(false);
      return;
    }
    this.socket.removeAllListeners();
    this.socket.disconnect();
    this.socket = null;
    this.emitConnection(false);
  }
}

export const socketService = new SocketService();
