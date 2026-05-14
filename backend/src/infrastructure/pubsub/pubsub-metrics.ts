import { Counter, type Registry } from "prom-client";

let publish: Counter | undefined;
let receive: Counter | undefined;
let socketEmit: Counter | undefined;

export function registerPubSubMetrics(register: Registry): void {
  if (publish) {
    return;
  }
  publish = new Counter({
    name: "redis_pubsub_messages_published_total",
    help: "Redis PUBLISH calls for real-time org channels (by event type).",
    labelNames: ["event_type"],
    registers: [register],
  });
  receive = new Counter({
    name: "redis_pubsub_messages_received_total",
    help: "Redis PMESSAGE deliveries processed by the subscriber (by event type).",
    labelNames: ["event_type"],
    registers: [register],
  });
  socketEmit = new Counter({
    name: "socketio_realtime_events_emitted_total",
    help: "Socket.io room emits forwarded from Redis pub/sub (by event type).",
    labelNames: ["event_type"],
    registers: [register],
  });
}

export function recordPubsubPublish(eventType: string): void {
  publish?.inc({ event_type: eventType });
}
export function recordPubsubReceive(eventType: string): void {
  receive?.inc({ event_type: eventType });
}
export function recordSocketioEmit(eventType: string): void {
  socketEmit?.inc({ event_type: eventType });
}
