import { injectable } from "inversify";

import type { IAuditLog } from "./audit.model.js";
import {
  createAuditChecksum,
  verifyAuditChecksum,
  verifyAuditChecksumFromSearchDocument,
} from "./audit-checksum.js";
import { recordAuditChecksumMismatch } from "./audit-integrity-metrics.js";
import type { AuditEventDocument } from "./audit.types.js";

@injectable()
export class AuditIntegrityService {
  attachChecksum<T extends Omit<IAuditLog, "_id" | "checksum">>(
    payload: T,
  ): T & { checksum: string } {
    return {
      ...payload,
      checksum: createAuditChecksum(payload),
    };
  }

  verifyMongoLog(log: IAuditLog): boolean {
    const valid = verifyAuditChecksum(log, log.checksum);
    if (!valid) {
      this.alertMismatch("mongodb", {
        audit_id: String(log._id),
        org_id: String(log.org_id),
        action: log.action,
        stored_checksum: log.checksum,
      });
    }
    return valid;
  }

  verifySearchDocument(
    doc: AuditEventDocument & { checksum?: string },
    auditId: string,
  ): boolean {
    const valid = verifyAuditChecksumFromSearchDocument(doc);
    if (!valid) {
      this.alertMismatch("opensearch", {
        audit_id: auditId,
        org_id: doc.org_id,
        action: doc.action,
        stored_checksum: doc.checksum,
      });
    }
    return valid;
  }

  private alertMismatch(
    source: "mongodb" | "opensearch",
    payload: Record<string, unknown>,
  ): void {
    recordAuditChecksumMismatch(source);
    process.stderr.write(
      `[AUDIT ALERT] Checksum mismatch (${source}) ${JSON.stringify(payload)}\n`,
    );
  }
}
