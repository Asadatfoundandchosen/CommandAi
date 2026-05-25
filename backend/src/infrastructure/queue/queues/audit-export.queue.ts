import { Queue } from "bullmq";

import { queueConnection } from "../connection.js";
import type { AuditExportJobParams } from "../../../modules/audit/audit.types.js";

export interface AuditExportJob {
  orgId: string;
  params: AuditExportJobParams;
  /** Recipient for presigned download link (required for async exports). */
  notifyEmail: string;
  requestedByUserId?: string;
}

export const auditExportQueue = new Queue<AuditExportJob>("audit-export", {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});
