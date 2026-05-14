export { auditQueue, type AuditJob } from "./audit.queue.js";
export { executionQueue, type ExecutionJob } from "./execution.queue.js";
export {
  notificationQueue,
  type NotificationJob,
} from "./notification.queue.js";
export { signalQueue, type SignalJob } from "./signal.queue.js";
export {
  webhookDeliveryQueue,
  type WebhookDeliveryJob,
} from "./webhook-delivery.queue.js";

import { auditQueue } from "./audit.queue.js";
import { executionQueue } from "./execution.queue.js";
import { notificationQueue } from "./notification.queue.js";
import { signalQueue } from "./signal.queue.js";
import { webhookDeliveryQueue } from "./webhook-delivery.queue.js";

/** Named handles for shutdown and bulk operations. */
export const queues = {
  signals: signalQueue,
  execution: executionQueue,
  notifications: notificationQueue,
  audit: auditQueue,
  webhooks: webhookDeliveryQueue,
} as const;
