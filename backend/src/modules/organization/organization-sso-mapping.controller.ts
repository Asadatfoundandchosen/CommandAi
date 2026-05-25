import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import {
  JitProvisioningConfigError,
  JitProvisioningService,
} from "../auth/jit-provisioning.service.js";
import { upsertSsoMappingBodySchema } from "../auth/sso-mapping.validation.js";
import {
  DEFAULT_FIRST_NAME_ATTRS,
  DEFAULT_LAST_NAME_ATTRS,
} from "../auth/jit-provisioning.logic.js";

@injectable()
export class OrganizationSsoMappingController {
  constructor(
    @inject(JitProvisioningService) private readonly jit: JitProvisioningService,
  ) {}

  /** `GET /api/v1/organization/sso-mapping` */
  get = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }

    const mapping = await this.jit.getMappingForOrg(orgId);
    res.status(200).json({
      data: mapping ?? {
        org_id: orgId,
        jit_enabled: false,
        default_role: "dept_user",
        default_account_id: null,
        default_department_id: null,
        first_name_attr: null,
        last_name_attr: null,
        department_attr: null,
      },
      attribute_hints: {
        first_name: [...DEFAULT_FIRST_NAME_ATTRS],
        last_name: [...DEFAULT_LAST_NAME_ATTRS],
        department: ["department", "Department", "ou"],
      },
    });
  };

  /** `PUT /api/v1/organization/sso-mapping` */
  upsert = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }

    const parsed = upsertSsoMappingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const data = await this.jit.upsertMapping(orgId, parsed.data);
      res.status(200).json({ data });
    } catch (e) {
      if (e instanceof JitProvisioningConfigError) {
        res.status(400).json({ error: e.message });
        return;
      }
      const message = e instanceof Error ? e.message : "Failed to save SSO mapping";
      res.status(400).json({ error: message });
    }
  };
}
