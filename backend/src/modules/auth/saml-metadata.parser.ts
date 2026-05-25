import { normalizePemCertificate } from "./saml.logic.js";

export type ParsedIdpMetadata = {
  idp_entity_id?: string;
  idp_login_url: string;
  idp_logout_url?: string;
  idp_certificates: string[];
};

/**
 * Extract SSO URL and signing certs from IdP metadata XML (Okta / Azure AD / OneLogin).
 * Minimal parser — sufficient for common EntityDescriptor layouts.
 */
export function parseIdpMetadataXml(xml: string): ParsedIdpMetadata {
  const entityIdMatch = xml.match(
    /<(?:[\w-]+:)?EntityDescriptor[^>]*\sEntityID=["']([^"']+)["']/i,
  );
  const idp_entity_id = entityIdMatch?.[1];

  const loginUrl =
    xml.match(
      /<(?:[\w-]+:)?SingleSignOnService[^>]*Binding=["'][^"']*HTTP-Redirect[^"']*["'][^>]*Location=["']([^"']+)["']/i,
    )?.[1] ??
    xml.match(
      /<(?:[\w-]+:)?SingleSignOnService[^>]*Location=["']([^"']+)["'][^>]*Binding=["'][^"']*HTTP-Redirect/i,
    )?.[1] ??
    xml.match(
      /<(?:[\w-]+:)?SingleSignOnService[^>]*Binding=["'][^"']*HTTP-POST[^"']*["'][^>]*Location=["']([^"']+)["']/i,
    )?.[1];

  if (!loginUrl) {
    throw new Error("IdP metadata missing SingleSignOnService Location");
  }

  const logoutUrl =
    xml.match(
      /<(?:[\w-]+:)?SingleLogoutService[^>]*Location=["']([^"']+)["']/i,
    )?.[1] ?? undefined;

  const certMatches = xml.matchAll(
    /<(?:[\w-]+:)?X509Certificate>([\s\S]*?)<\/(?:[\w-]+:)?X509Certificate>/gi,
  );
  const idp_certificates: string[] = [];
  for (const match of certMatches) {
    const body = match[1]?.replace(/\s+/g, "") ?? "";
    if (body.length > 0) {
      idp_certificates.push(normalizePemCertificate(body));
    }
  }

  if (idp_certificates.length === 0) {
    throw new Error("IdP metadata missing X509Certificate");
  }

  return {
    idp_entity_id,
    idp_login_url: loginUrl,
    idp_logout_url: logoutUrl,
    idp_certificates,
  };
}
