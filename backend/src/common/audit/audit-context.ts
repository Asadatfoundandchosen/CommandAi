import { AsyncLocalStorage } from "node:async_hooks";

import type { Request } from "express";

export type AuditRequestContext = {
  req?: Request;
  requestId: string;
  traceId?: string;
};

export const auditContextStorage = new AsyncLocalStorage<AuditRequestContext>();

export function runWithAuditContext<T>(
  context: AuditRequestContext,
  fn: () => T,
): T {
  return auditContextStorage.run(context, fn);
}

export function getAuditContext(): AuditRequestContext | undefined {
  return auditContextStorage.getStore();
}
