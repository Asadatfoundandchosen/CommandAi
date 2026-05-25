import type { RequestHandler } from "express";

export type HttpsSecurityOptions = {
  /** Send `Strict-Transport-Security` on responses (set at ALB and app for defense in depth). */
  hstsMaxAgeSeconds?: number;
  includeSubDomains?: boolean;
  preload?: boolean;
  /** Redirect HTTP → HTTPS when the request is not already secure (requires `trust proxy`). */
  forceHttpsRedirect?: boolean;
};

const DEFAULT_HSTS_MAX_AGE = 31_536_000; // 365 days

/**
 * HSTS + optional HTTP→HTTPS redirect for API traffic behind TLS-terminating load balancers.
 */
export function createHttpsSecurityMiddleware(
  options: HttpsSecurityOptions = {},
): RequestHandler {
  const maxAge = options.hstsMaxAgeSeconds ?? DEFAULT_HSTS_MAX_AGE;
  const hstsParts = [`max-age=${maxAge}`];
  if (options.includeSubDomains !== false) {
    hstsParts.push("includeSubDomains");
  }
  if (options.preload) {
    hstsParts.push("preload");
  }
  const hstsValue = hstsParts.join("; ");

  const forceRedirect = options.forceHttpsRedirect === true;

  return (req, res, next) => {
    res.setHeader("Strict-Transport-Security", hstsValue);

    if (forceRedirect && !req.secure) {
      const host = req.get("host") ?? req.hostname;
      const target = `https://${host}${req.originalUrl}`;
      res.redirect(301, target);
      return;
    }

    next();
  };
}
