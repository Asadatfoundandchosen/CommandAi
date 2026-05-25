import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { OidcService } from "../auth/oidc.service.js";
import { upsertOrgOidcConfigBodySchema } from "../auth/oidc.validation.js";
import { OIDC_ISSUER_HINTS } from "../auth/oidc.constants.js";

@injectable()
export class OrganizationOidcController {
  constructor(@inject(OidcService) private readonly oidc: OidcService) {}

  /** `GET /api/v1/organization/oidc` — org OIDC config (no client secret). */
  get = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }
    const config = await this.oidc.getOrgOidcConfigView(orgId);
    res.status(200).json({
      data: config ?? {
        org_id: orgId,
        enabled: false,
        issuer_url: "",
        client_id: "",
        scopes: "openid profile email",
        redirect_uri: this.oidc.redirectUri(orgId),
        login_url: this.oidc.loginInitUrl(orgId),
      },
      issuer_hints: OIDC_ISSUER_HINTS,
    });
  };

  /** `PUT /api/v1/organization/oidc` — configure Google / Microsoft / custom OIDC (org_admin). */
  upsert = async (req: Request, res: Response): Promise<void> => {
    const orgId = req.tenantId;
    if (!orgId) {
      res.status(401).json({ error: "Tenant context required" });
      return;
    }
    const parsed = upsertOrgOidcConfigBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const data = await this.oidc.upsertOrgOidcConfig(orgId, parsed.data);
      res.status(200).json({ data });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to save OIDC config";
      res.status(400).json({ error: message });
    }
  };
}
