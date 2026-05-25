import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { AdminAuditService } from "../audit/admin-audit.service.js";
import { ADMIN_EVENTS } from "../audit/admin-events.js";
import { RetentionService } from "./retention.service.js";
import { upsertRetentionPolicyBodySchema } from "./retention.validation.js";

@injectable()
export class RetentionController {
  constructor(
    @inject(RetentionService) private readonly retention: RetentionService,
    @inject(AdminAuditService) private readonly adminAudit: AdminAuditService,
  ) {}

  /** `GET /api/v1/organization/retention-policy` */
  get = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }

    const data = await this.retention.getPolicyForOrg(orgId);
    res.status(200).json({ data });
  };

  /** `PUT /api/v1/organization/retention-policy` */
  upsert = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }

    const parsed = upsertRetentionPolicyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const before = await this.retention.getPolicyForOrg(orgId);
      const data = await this.retention.upsertPolicy(orgId, {
        audit_retention_days: parsed.data.audit_retention_days,
        archive_before_delete: parsed.data.archive_before_delete,
        ...(parsed.data.archive_location !== undefined
          ? { archive_location: parsed.data.archive_location }
          : {}),
      });

      const auditActor =
        this.adminAudit.actorFromRequest(req) ??
        this.adminAudit.systemActorFromRequest(req);

      await this.adminAudit.logAdminAction(
        ADMIN_EVENTS.RETENTION_POLICY_CHANGED,
        orgId,
        auditActor,
        { type: "retention_policy", id: orgId, name: orgId },
        {
          before: {
            audit_retention_days: before.audit_retention_days,
            archive_before_delete: before.archive_before_delete,
            archive_location: before.archive_location,
          },
          after: {
            audit_retention_days: data.audit_retention_days,
            archive_before_delete: data.archive_before_delete,
            archive_location: data.archive_location,
          },
        },
      );

      res.status(200).json({ data });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Invalid retention policy";
      res.status(400).json({ error: message });
    }
  };

  /** `GET /api/v1/organization/retention-policy/compliance-report` */
  complianceReport = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }

    const data = await this.retention.generateComplianceReport(orgId);
    res.status(200).json({ data });
  };
}
