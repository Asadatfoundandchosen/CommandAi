import { randomInt, timingSafeEqual } from "node:crypto";
import { inject, injectable } from "inversify";
import twilio from "twilio";

import {
  encryptFieldsForUpdate,
  USER_ENCRYPTED_FIELDS,
} from "@common/encryption/mongoose-field-encryption.plugin.js";
import { config } from "@config/index.js";
import { getRedisClient } from "../../infrastructure/cache/redis-client.js";
import { UserModel } from "@modules/user/user.model.js";

import { logSmsMfaOperation } from "./sms-mfa.logger.js";
import { validatePhoneNumber } from "./phone.validation.js";
import type { ClientContext } from "./auth-session.types.js";
import { AuthAuditService } from "./auth-audit.service.js";

export const SMS_CODE_TTL_SEC = 300;
export const SMS_CODE_LENGTH = 6;
export const SMS_RATE_LIMIT_MAX = 3;
export const SMS_RATE_LIMIT_WINDOW_SEC = 600;

export const SMS_MFA_CODE_KEY_PREFIX = "sms_mfa:" as const;
export const SMS_MFA_PHONE_KEY_PREFIX = "sms_mfa_phone:" as const;
export const SMS_MFA_RATE_KEY_PREFIX = "sms_mfa_rate:" as const;

export function smsMfaCodeKey(userId: string): string {
  return `${SMS_MFA_CODE_KEY_PREFIX}${userId}`;
}

export function smsMfaPhoneKey(userId: string): string {
  return `${SMS_MFA_PHONE_KEY_PREFIX}${userId}`;
}

export function smsMfaRateKey(userId: string): string {
  return `${SMS_MFA_RATE_KEY_PREFIX}${userId}`;
}

export function generateSecureCode(length: number): string {
  const max = 10 ** length;
  const value = randomInt(0, max);
  return String(value).padStart(length, "0");
}

export class SmsMfaUnavailableError extends Error {
  constructor() {
    super("SMS MFA is not configured");
    this.name = "SmsMfaUnavailableError";
  }
}

export class SmsRateLimitError extends Error {
  constructor() {
    super("Too many SMS verification requests. Try again later.");
    this.name = "SmsRateLimitError";
  }
}

export class InvalidSmsCodeError extends Error {
  constructor() {
    super("Invalid or expired SMS verification code");
    this.name = "InvalidSmsCodeError";
  }
}

export class SmsMfaNotEnabledError extends Error {
  constructor() {
    super("SMS MFA is not enabled");
    this.name = "SmsMfaNotEnabledError";
  }
}

@injectable()
export class SmsMfaService {
  constructor(
    @inject(AuthAuditService) private readonly authAudit: AuthAuditService,
  ) {}

  private twilioClient(): ReturnType<typeof twilio> | null {
    const tw = config.twilio;
    if (!tw) {
      return null;
    }
    return twilio(tw.accountSid, tw.authToken);
  }

  private redis() {
    const client = getRedisClient();
    if (!client) {
      throw new Error("Redis unavailable");
    }
    return client;
  }

  private async assertRateLimit(userId: string): Promise<void> {
    const redis = this.redis();
    const key = smsMfaRateKey(userId);
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, SMS_RATE_LIMIT_WINDOW_SEC);
    }
    if (count > SMS_RATE_LIMIT_MAX) {
      throw new SmsRateLimitError();
    }
  }

  /** Send a 6-digit code via Twilio; store in Redis for 5 minutes. */
  async sendSMSCode(userId: string, phoneNumber: string): Promise<void> {
    if (!config.twilio) {
      throw new SmsMfaUnavailableError();
    }

    const phone = validatePhoneNumber(phoneNumber);
    await this.assertRateLimit(userId);

    const code = generateSecureCode(SMS_CODE_LENGTH);
    const redis = this.redis();

    await redis
      .multi()
      .set(smsMfaCodeKey(userId), code, "EX", SMS_CODE_TTL_SEC)
      .set(smsMfaPhoneKey(userId), phone, "EX", SMS_CODE_TTL_SEC)
      .exec();

    const client = this.twilioClient();
    if (!client) {
      throw new SmsMfaUnavailableError();
    }

    try {
      const message = await client.messages.create({
        body: `Your 1CommandAI verification code is: ${code}`,
        to: phone,
        from: config.twilio.fromNumber,
      });
      logSmsMfaOperation("sms_mfa_sent", {
        user_id: userId,
        phone_last4: phone.slice(-4),
        message_sid: message.sid,
      });
    } catch (err) {
      logSmsMfaOperation("sms_mfa_send_failed", {
        user_id: userId,
        phone_last4: phone.slice(-4),
        error: err instanceof Error ? err.message : "twilio_error",
      });
      throw err;
    }
  }

  async verifySMSCode(userId: string, code: string): Promise<boolean> {
    const redis = this.redis();
    const stored = await redis.get(smsMfaCodeKey(userId));
    if (!stored || !/^\d{6}$/.test(code)) {
      return false;
    }

    const a = Buffer.from(stored, "utf8");
    const b = Buffer.from(code, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return false;
    }

    await redis.del(smsMfaCodeKey(userId));
    return true;
  }

  /** Confirm SMS code and enable SMS MFA for the user. */
  async verifyAndEnableSmsMfa(
    userId: string,
    code: string,
    clientContext?: ClientContext,
  ): Promise<{ mfa_enabled: true; sms_enabled: true; phone_number: string }> {
    const redis = this.redis();
    const stored = await redis.get(smsMfaCodeKey(userId));
    const phone = await redis.get(smsMfaPhoneKey(userId));
    if (!stored || !phone || !/^\d{6}$/.test(code)) {
      throw new InvalidSmsCodeError();
    }

    const a = Buffer.from(stored, "utf8");
    const b = Buffer.from(code, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new InvalidSmsCodeError();
    }

    await redis.del(smsMfaCodeKey(userId), smsMfaPhoneKey(userId));

    const user = await UserModel.findOne({ _id: userId, is_deleted: false })
      .select("org_id")
      .lean<{ org_id: { toString(): string } } | null>();

    const phoneEnc = encryptFieldsForUpdate(USER_ENCRYPTED_FIELDS, {
      phone_number: phone,
    });
    await UserModel.updateOne(
      { _id: userId, is_deleted: false },
      {
        $set: {
          ...phoneEnc.$set,
          mfa_enabled: true,
          "mfa.sms_enabled": true,
        },
        $unset: phoneEnc.$unset,
      },
    );

    logSmsMfaOperation("sms_mfa_verified", {
      user_id: userId,
      phone_last4: phone.slice(-4),
    });

    if (user) {
      await this.authAudit.logMfaEnabled(clientContext, {
        userId,
        orgId: String(user.org_id),
        method: "sms",
      });
    }

    return { mfa_enabled: true, sms_enabled: true, phone_number: phone };
  }

  async disableSmsMfa(userId: string, clientContext?: ClientContext): Promise<void> {
    const user = await UserModel.findOne({
      _id: userId,
      is_deleted: false,
    })
      .select("+mfa.totp_secret_enc")
      .lean();

    if (!user?.mfa?.sms_enabled) {
      throw new SmsMfaNotEnabledError();
    }

    const stillTotp =
      Boolean(user.mfa?.totp_secret_enc) && !user.mfa?.totp_pending;

    await UserModel.updateOne(
      { _id: userId },
      {
        $set: {
          mfa_enabled: stillTotp,
          "mfa.sms_enabled": false,
        },
        $unset: {
          phone_number: "",
          phone_number_enc: "",
          phone_number_search: "",
        },
      },
    );

    const redis = this.redis();
    await redis.del(smsMfaCodeKey(userId), smsMfaPhoneKey(userId));

    await this.authAudit.logMfaDisabled(clientContext, {
      userId,
      orgId: String(user.org_id),
      method: "sms",
    });
  }
}
