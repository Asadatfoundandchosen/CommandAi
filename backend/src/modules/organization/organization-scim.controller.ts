import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { ScimService } from "../scim/scim.service.js";
import { upsertScimConfigBodySchema } from "../scim/scim.validation.js";

@injectable()
export class OrganizationScimController {
  constructor(@inject(ScimService) private readonly scim: ScimService) {}

  /** `GET /api/v1/organization/scim` */
  get = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }
    const data = await this.scim.getConfigForOrg(orgId);
    res.status(200).json({ data });
  };

  /** `PUT /api/v1/organization/scim` — enable SCIM and rotate bearer token. */
  upsert = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }
    const parsed = upsertScimConfigBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const data = await this.scim.upsertConfig(orgId, {
        enabled: parsed.data.enabled,
        default_role: parsed.data.default_role,
        default_account_id: parsed.data.default_account_id,
        default_department_id: parsed.data.default_department_id,
        rotate_token: parsed.data.rotate_token ?? parsed.data.enabled,
      });
      res.status(200).json({
        data,
        note: data.bearer_token
          ? "Store bearer_token securely — it is shown only once."
          : undefined,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save SCIM config";
      res.status(400).json({ error: message });
    }
  };
}
