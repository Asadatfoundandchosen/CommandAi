import { EventEmitter } from "node:events";

import type { EventName } from "./event-types.js";

export type EventHandler<T> = (payload: T) => Promise<void>;

type WrappedListener = (payload: unknown) => void;

/**
 * In-process typed event bus: async handlers, isolated errors (one failure does
 * not block others). `off` removes the same `handler` reference that was passed to `on`.
 */
class TypedEventBus {
  private readonly emitter = new EventEmitter();
  /** `event` → (user handler → wrapper registered on EventEmitter) */
  private readonly wrappers = new Map<string, Map<EventHandler<unknown>, WrappedListener>>();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  emit<T>(event: EventName, payload: T): boolean {
    return this.emitter.emit(event, payload);
  }

  on<T>(event: EventName, handler: EventHandler<T>): void {
    this.off(event, handler as EventHandler<unknown>);

    const wrapped: WrappedListener = (payload) => {
      void (async () => {
        try {
          await handler(payload as T);
        } catch (error) {
          process.stderr.write(
            `Event handler error for ${event}: ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`,
          );
        }
      })();
    };

    let byEvent = this.wrappers.get(event);
    if (!byEvent) {
      byEvent = new Map();
      this.wrappers.set(event, byEvent);
    }
    byEvent.set(handler as EventHandler<unknown>, wrapped);
    this.emitter.on(event, wrapped);
  }

  off(event: EventName, handler: EventHandler<unknown>): void {
    const byEvent = this.wrappers.get(event);
    const wrapped = byEvent?.get(handler);
    if (wrapped) {
      this.emitter.off(event, wrapped);
      byEvent?.delete(handler);
      if (byEvent && byEvent.size === 0) {
        this.wrappers.delete(event);
      }
    }
  }
}

export const eventBus = new TypedEventBus();
