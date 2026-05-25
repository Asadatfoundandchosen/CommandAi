/** Magic link Redis TTL — 15 minutes. */
export const MAGIC_LINK_TTL_SEC = 900;

export const MAGIC_LINK_KEY_PREFIX = "magic:" as const;
export const MAGIC_LINK_SEND_RATE_KEY_PREFIX = "magic_send_rate:" as const;

/** Max magic-link emails per address per window. */
export const MAGIC_LINK_SEND_RATE_MAX = 5;
export const MAGIC_LINK_SEND_RATE_WINDOW_SEC = 900;

export function magicLinkTokenKey(token: string): string {
  return `${MAGIC_LINK_KEY_PREFIX}${token}`;
}

export function magicLinkSendRateKey(normalizedEmail: string): string {
  return `${MAGIC_LINK_SEND_RATE_KEY_PREFIX}${normalizedEmail}`;
}
