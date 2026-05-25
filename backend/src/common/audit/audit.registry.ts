import type { AuditService } from "@modules/audit/audit.service.js";

let auditServiceInstance: AuditService | undefined;

export function setAuditService(service: AuditService): void {
  auditServiceInstance = service;
}

export function getAuditService(): AuditService | undefined {
  return auditServiceInstance;
}
