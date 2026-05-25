import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { extractClientContext } from "./client-context.js";
import { applyAuthCookies } from "./auth-response.js";
import {
  SamlAssertionError,
  SamlNotConfiguredError,
  SamlService,
  SamlUserNotFoundError,
} from "./saml.service.js";
import { samlOrgIdParamSchema } from "./saml.validation.js";

@injectable()
export class SamlController {
  constructor(@inject(SamlService) private readonly saml: SamlService) {}

  /** `GET /api/v1/auth/saml/:orgId/login` — SP-initiated SSO redirect. */
  login = async (req: Request, res: Response): Promise<void> => {
    const parsed = samlOrgIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const loginUrl = await this.saml.createLoginRedirectUrl(parsed.data.orgId);
      res.redirect(302, loginUrl);
    } catch (e) {
      if (e instanceof SamlNotConfiguredError) {
        res.status(404).json({ error: e.message, code: "saml_not_configured" });
        return;
      }
      const message = e instanceof Error ? e.message : "SAML login failed";
      res.status(500).json({ error: message });
    }
  };

  /** `POST /api/v1/auth/saml/:orgId/callback` — ACS (POST binding, signed assertion). */
  callback = async (req: Request, res: Response): Promise<void> => {
    const parsed = samlOrgIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const result = await this.saml.handleAssertionCallback(
        parsed.data.orgId,
        req.body as Record<string, unknown>,
        extractClientContext(req),
      );
      applyAuthCookies(res, result);
      res.redirect(302, result.redirectUrl);
    } catch (e) {
      if (e instanceof SamlNotConfiguredError) {
        res.status(404).json({ error: e.message, code: "saml_not_configured" });
        return;
      }
      if (e instanceof SamlUserNotFoundError) {
        res.status(403).json({ error: e.message, code: "saml_user_not_found" });
        return;
      }
      if (e instanceof SamlAssertionError) {
        res.status(401).json({ error: e.message, code: "invalid_saml_assertion" });
        return;
      }
      const message = e instanceof Error ? e.message : "SAML callback failed";
      res.status(500).json({ error: message });
    }
  };

  /** `GET /api/v1/auth/saml/:orgId/metadata` — SP metadata XML for IdP configuration. */
  metadata = async (req: Request, res: Response): Promise<void> => {
    const parsed = samlOrgIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const xml = await this.saml.createSpMetadata(parsed.data.orgId);
      res.type("application/xml").status(200).send(xml);
    } catch (e) {
      if (e instanceof SamlNotConfiguredError) {
        res.status(404).json({ error: e.message });
        return;
      }
      const message = e instanceof Error ? e.message : "SAML metadata failed";
      res.status(500).json({ error: message });
    }
  };

  /** `POST /api/v1/auth/saml/:orgId/logout` — initiate SAML SLO (requires JWT). */
  logout = async (req: Request, res: Response): Promise<void> => {
    const parsed = samlOrgIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const userId = req.user?.sub;
    if (!userId) {
      res.status(401).json({ error: "Authorization required" });
      return;
    }
    try {
      const logoutUrl = await this.saml.createLogoutRedirectUrl(
        parsed.data.orgId,
        userId,
      );
      if (!logoutUrl) {
        res.status(204).send();
        return;
      }
      res.redirect(302, logoutUrl);
    } catch (e) {
      if (e instanceof SamlNotConfiguredError) {
        res.status(404).json({ error: e.message });
        return;
      }
      const message = e instanceof Error ? e.message : "SAML logout failed";
      res.status(500).json({ error: message });
    }
  };
}
