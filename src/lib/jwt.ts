/** Decode JWT payload (no signature verify — client hint only). */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const segment = token.split('.')[1];
    if (!segment) {
      return null;
    }
    const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function orgIdFromAccessToken(token: string): string | null {
  const payload = decodeJwtPayload(token);
  const orgId = payload?.org_id;
  return typeof orgId === 'string' && orgId.length > 0 ? orgId : null;
}
