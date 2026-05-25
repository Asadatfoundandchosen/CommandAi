import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { GroupMappingService } from "../auth/group-mapping.service.js";
import { upsertGroupMappingBodySchema } from "../auth/group-mapping.validation.js";

@injectable()
export class OrganizationGroupMappingController {
  constructor(
    @inject(GroupMappingService) private readonly groups: GroupMappingService,
  ) {}

  /** `GET /api/v1/organization/group-mapping` */
  get = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }

    const mapping = await this.groups.getMappingForOrg(orgId);
    res.status(200).json({
      data: mapping ?? {
        org_id: orgId,
        enabled: false,
        fallback_role: "dept_user",
        mappings: [],
        role_precedence: ["dept_user", "dept_manager", "account_admin", "org_admin"],
      },
    });
  };

  /** `PUT /api/v1/organization/group-mapping` */
  upsert = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }

    const parsed = upsertGroupMappingBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    try {
      const data = await this.groups.upsertMapping(orgId, parsed.data);
      res.status(200).json({ data });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save group mapping";
      res.status(400).json({ error: message });
    }
  };
}
