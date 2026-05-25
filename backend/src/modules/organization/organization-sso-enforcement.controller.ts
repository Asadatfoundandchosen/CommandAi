import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { EmergencyAccessService } from "../auth/emergency-access.service.js";
import { SsoEnforcementService } from "../auth/sso-enforcement.service.js";
import {
  grantEmergencyAccessBodySchema,
  upsertSsoEnforcementBodySchema,
} from "../auth/sso-enforcement.validation.js";

@injectable()
export class OrganizationSsoEnforcementController {
  constructor(
    @inject(SsoEnforcementService) private readonly enforcement: SsoEnforcementService,
    @inject(EmergencyAccessService) private readonly emergency: EmergencyAccessService,
  ) {}

  /** `GET /api/v1/organization/sso-enforcement` */
  get = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }
    const data = await this.enforcement.getEnforcementForOrg(orgId);
    res.status(200).json({ data });
  };

  /** `PUT /api/v1/organization/sso-enforcement` */
  upsert = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }
    const parsed = upsertSsoEnforcementBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const data = await this.enforcement.upsertEnforcement(orgId, parsed.data.enforce);
      res.status(200).json({ data });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to update SSO enforcement";
      res.status(400).json({ error: message });
    }
  };

  /** `POST /api/v1/organization/emergency-access` — time-limited password login bypass. */
  grantEmergency = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    const grantedBy = req.user?.sub;
    if (!orgId || !grantedBy) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }
    const parsed = grantEmergencyAccessBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const data = await this.emergency.grantEmergencyAccess(
        orgId,
        parsed.data.user_id,
        grantedBy,
        parsed.data.ttl_hours,
      );
      res.status(200).json({ data });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to grant emergency access";
      res.status(400).json({ error: message });
    }
  };

  /** `DELETE /api/v1/organization/emergency-access/:userId` */
  revokeEmergency = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }
    const userId = req.params.userId;
    if (!userId || !/^[a-fA-F0-9]{24}$/.test(userId)) {
      res.status(400).json({ error: "Invalid userId" });
      return;
    }
    try {
      await this.emergency.revokeEmergencyAccess(orgId, userId);
      res.status(204).send();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to revoke emergency access";
      res.status(400).json({ error: message });
    }
  };
}
