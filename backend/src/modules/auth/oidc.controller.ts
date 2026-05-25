import { inject, injectable } from "inversify";
import type { Request, Response } from "express";

import { extractClientContext } from "./client-context.js";
import { applyAuthCookies } from "./auth-response.js";
import {
  OidcCallbackError,
  OidcNotConfiguredError,
  OidcService,
  OidcUserNotFoundError,
} from "./oidc.service.js";
import { oidcOrgIdParamSchema } from "./oidc.validation.js";

@injectable()
export class OidcController {
  constructor(@inject(OidcService) private readonly oidc: OidcService) {}

  /** `GET /api/v1/auth/oidc/:orgId/login` — redirect to IdP (authorization code + PKCE). */
  login = async (req: Request, res: Response): Promise<void> => {
    const parsed = oidcOrgIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    try {
      const authUrl = await this.oidc.initiateLogin(parsed.data.orgId);
      res.redirect(302, authUrl);
    } catch (e) {
      if (e instanceof OidcNotConfiguredError) {
        res.status(404).json({ error: e.message, code: "oidc_not_configured" });
        return;
      }
      const message = e instanceof Error ? e.message : "OIDC login failed";
      res.status(500).json({ error: message });
    }
  };

  /** `GET /api/v1/auth/oidc/:orgId/callback` — exchange code for tokens and issue app session. */
  callback = async (req: Request, res: Response): Promise<void> => {
    const parsed = oidcOrgIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const query = req.query as Record<string, string | undefined>;
    try {
      const result = await this.oidc.handleCallback(
        parsed.data.orgId,
        {
          code: query.code,
          state: query.state,
          error: query.error,
          error_description: query.error_description,
        },
        extractClientContext(req),
      );
      applyAuthCookies(res, result);
      res.redirect(302, result.redirectUrl);
    } catch (e) {
      if (e instanceof OidcNotConfiguredError) {
        res.status(404).json({ error: e.message, code: "oidc_not_configured" });
        return;
      }
      if (e instanceof OidcUserNotFoundError) {
        res.status(403).json({ error: e.message, code: "oidc_user_not_found" });
        return;
      }
      if (e instanceof OidcCallbackError) {
        res.status(401).json({ error: e.message, code: "oidc_callback_failed" });
        return;
      }
      const message = e instanceof Error ? e.message : "OIDC callback failed";
      res.status(500).json({ error: message });
    }
  };
}
