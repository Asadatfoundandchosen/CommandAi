import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { SamlService } from "../auth/saml.service.js";
import { upsertOrgSamlConfigBodySchema } from "../auth/saml.validation.js";

@injectable()
export class OrganizationSamlController {
  constructor(@inject(SamlService) private readonly saml: SamlService) {}

  /** `GET /api/v1/organization/saml` — org SAML config (no private keys). */
  get = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }
    const config = await this.saml.getOrgSamlConfigView(orgId);
    res.status(200).json({
      data: config ?? {
        org_id: orgId,
        enabled: false,
        idp_login_url: "",
        idp_certificates: [],
        sp_entity_id: this.saml.spEntityId(orgId),
        assert_endpoint: this.saml.assertEndpoint(orgId),
        login_url: this.saml.loginInitUrl(orgId),
        metadata_url: this.saml.spEntityId(orgId),
      },
    });
  };

  /** `PUT /api/v1/organization/saml` — store IdP metadata / SSO URLs (org_admin). */
  upsert = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }
    const parsed = upsertOrgSamlConfigBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const data = await this.saml.upsertOrgSamlConfig(orgId, parsed.data);
      res.status(200).json({ data });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save SAML config";
      res.status(400).json({ error: message });
    }
  };
}
