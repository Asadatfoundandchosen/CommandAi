import { randomBytes } from "node:crypto";
import { inject, injectable } from "inversify";

import { config } from "@config/index.js";
import { getRedisClient } from "../../infrastructure/cache/redis-client.js";
import { UserModel } from "@modules/user/user.model.js";
import { TYPES } from "../../types.js";

import type { ClientContext } from "./auth-session.types.js";
import { AuthService, type LoginResult } from "./auth.service.js";
import { SsoEnforcementService } from "./sso-enforcement.service.js";
import { SSORequiredError } from "./sso-enforcement.errors.js";
import { sendMagicLinkEmail } from "./magic-link-email.js";
import {
  MAGIC_LINK_SEND_RATE_MAX,
  MAGIC_LINK_SEND_RATE_WINDOW_SEC,
  MAGIC_LINK_TTL_SEC,
  magicLinkSendRateKey,
  magicLinkTokenKey,
} from "./magic-link.constants.js";
import { logMagicLinkOperation } from "./magic-link.logger.js";

export class InvalidMagicLinkError extends Error {
  constructor() {
    super("Invalid or expired magic link");
    this.name = "InvalidMagicLinkError";
  }
}

export class MagicLinkRateLimitError extends Error {
  constructor() {
    super("Too many magic link requests. Try again later.");
    this.name = "MagicLinkRateLimitError";
  }
}

export function buildMagicLinkUrl(token: string): string {
  const base = config.appUrl.replace(/\/$/, "");
  return `${base}/auth/magic?token=${encodeURIComponent(token)}`;
}

@injectable()
export class MagicLinkService {
  constructor(
    @inject(TYPES.AuthService) private readonly auth: AuthService,
    @inject(SsoEnforcementService) private readonly ssoEnforcement: SsoEnforcementService,
  ) {}

  private redis() {
    const client = getRedisClient();
    if (!client) {
      throw new Error("Redis unavailable");
    }
    return client;
  }

  private async assertSendRateLimit(normalizedEmail: string): Promise<void> {
    const redis = this.redis();
    const key = magicLinkSendRateKey(normalizedEmail);
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, MAGIC_LINK_SEND_RATE_WINDOW_SEC);
    }
    if (count > MAGIC_LINK_SEND_RATE_MAX) {
      throw new MagicLinkRateLimitError();
    }
  }

  /**
   * Send a one-time magic link. Always resolves without revealing whether the email exists.
   */
  async sendMagicLink(email: string, orgIdHint?: string): Promise<void> {
    const normalizedEmail = email.trim().toLowerCase();

    try {
      await this.assertSendRateLimit(normalizedEmail);
    } catch (e) {
      if (e instanceof MagicLinkRateLimitError) {
        logMagicLinkOperation("send_rate_limited", { email_domain: domainOf(normalizedEmail) });
        return;
      }
      throw e;
    }

    const users = await this.findActiveUsersByEmail(normalizedEmail, orgIdHint);
    if (users.length !== 1) {
      logMagicLinkOperation("send_skipped", {
        reason: users.length === 0 ? "no_match" : "ambiguous_email",
        email_domain: domainOf(normalizedEmail),
      });
      return;
    }

    const user = users[0];
    if (user.status !== "active") {
      logMagicLinkOperation("send_skipped", {
        reason: "inactive",
        user_id: String(user._id),
      });
      return;
    }

    try {
      await this.ssoEnforcement.checkSSOEnforcement(
        String(user.org_id),
        "magic_link",
        user.email,
      );
    } catch (e) {
      if (e instanceof SSORequiredError) {
        logMagicLinkOperation("send_skipped", {
          reason: "sso_enforced",
          user_id: String(user._id),
        });
        return;
      }
      throw e;
    }

    const token = randomBytes(32).toString("hex");
    const redis = this.redis();
    await redis.set(
      magicLinkTokenKey(token),
      String(user._id),
      "EX",
      MAGIC_LINK_TTL_SEC,
    );

    const link = buildMagicLinkUrl(token);
    const sent = await sendMagicLinkEmail({
      to: normalizedEmail,
      link,
      expiresIn: "15 minutes",
    });

    logMagicLinkOperation("send", {
      user_id: String(user._id),
      org_id: String(user.org_id),
      email_sent: sent,
      email_domain: domainOf(normalizedEmail),
    });
  }

  /** Consume token (one-time), issue JWT pair + session (MFA required when enabled). */
  async verifyMagicLink(
    token: string,
    clientContext?: ClientContext,
    mfaCode?: { totp_code?: string; backup_code?: string; sms_code?: string },
  ): Promise<LoginResult> {
    const trimmed = token.trim();
    if (!trimmed) {
      throw new InvalidMagicLinkError();
    }

    const redis = this.redis();
    const key = magicLinkTokenKey(trimmed);
    const userId = await redis.get(key);
    if (!userId) {
      logMagicLinkOperation("verify_failed", { reason: "invalid_or_expired" });
      throw new InvalidMagicLinkError();
    }

    await redis.del(key);

    logMagicLinkOperation("verify_consumed", { user_id: userId });

    const user = await UserModel.findById(userId).lean();
    if (user) {
      await this.ssoEnforcement.checkSSOEnforcement(
        String(user.org_id),
        "magic_link",
        user.email,
      );
    }

    return this.auth.authenticateVerifiedUser(userId, clientContext, mfaCode, {
      method: "magic_link",
    });
  }

  private async findActiveUsersByEmail(
    email: string,
    orgIdHint?: string,
  ) {
    const filter: Record<string, unknown> = {
      email,
      is_deleted: false,
    };
    if (orgIdHint) {
      filter.org_id = orgIdHint;
    }
    return UserModel.find(filter)
      .select("_id org_id email status")
      .lean();
  }
}

function domainOf(email: string): string {
  const at = email.indexOf("@");
  return at >= 0 ? email.slice(at + 1) : "unknown";
}
