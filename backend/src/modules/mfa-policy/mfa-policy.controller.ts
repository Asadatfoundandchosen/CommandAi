import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { MfaPolicyService } from "./mfa-policy.service.js";
import { AdminAuditService } from "../audit/admin-audit.service.js";
import { upsertMfaPolicyBodySchema } from "./mfa-policy.validation.js";

@injectable()
export class MfaPolicyController {
  constructor(
    @inject(MfaPolicyService) private readonly policies: MfaPolicyService,
    @inject(AdminAuditService) private readonly adminAudit: AdminAuditService,
  ) {}

  /** `GET /api/v1/organization/mfa-policy` */
  get = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }

    const policy = await this.policies.getPolicyForOrg(orgId);
    if (!policy) {
      res.status(200).json({
        data: {
          org_id: orgId,
          enabled: false,
          required_for: "none",
          grace_period_days: 14,
          allowed_methods: ["totp", "sms"],
          enforcement_date: null,
          grace_period_end: null,
          days_remaining: null,
          enforcement_active: false,
        },
      });
      return;
    }

    res.status(200).json({ data: policy });
  };

  /** `PUT /api/v1/organization/mfa-policy` */
  upsert = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }

    const parsed = upsertMfaPolicyBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const enforcementDate = parsed.data.enforcement_date
      ? new Date(parsed.data.enforcement_date)
      : undefined;

    const auditActor = this.adminAudit.actorFromRequest(req) ?? undefined;
    const policy = await this.policies.upsertPolicy(
      orgId,
      {
        enabled: parsed.data.enabled,
        required_for: parsed.data.required_for,
        grace_period_days: parsed.data.grace_period_days,
        allowed_methods: parsed.data.allowed_methods,
        enforcement_date: enforcementDate,
      },
      auditActor,
    );

    res.status(200).json({ data: policy });
  };
}
