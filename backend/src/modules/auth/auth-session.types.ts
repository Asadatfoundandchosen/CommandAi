/** Device metadata parsed from User-Agent. */
export type SessionDevice = {
  type: string;
  os: string;
  browser: string;
};

/** Geo hint from reverse-proxy headers (e.g. Cloudflare). */
export type SessionLocation = {
  country: string;
  city: string;
};

/**
 * Auth session tracked in Redis (linked to refresh token rotation).
 * `refresh_jti` is stored internally and omitted from API responses.
 */
export interface IAuthSession {
  session_id: string;
  user_id: string;
  org_id: string;
  refresh_jti: string;
  device: SessionDevice;
  ip_address: string;
  location: SessionLocation;
  created_at: string;
  last_active: string;
  expires_at: string;
}

/** Session row returned by `GET /api/v1/auth/sessions`. */
export type AuthSessionView = Omit<IAuthSession, "refresh_jti"> & {
  current: boolean;
};

export type ClientContext = {
  ip_address: string;
  device: SessionDevice;
  location: SessionLocation;
};
