import { inject, injectable } from "inversify";
import QRCode from "qrcode";
import speakeasy from "speakeasy";

import { decryptField, encryptField } from "@common/utils/field-encryption.js";
import type { IUser } from "@modules/user/user.model.js";
import { UserModel } from "@modules/user/user.model.js";

import {
  BackupCodesService,
  BACKUP_CODE_COUNT,
  buildBackupCodeStatus,
  type BackupCodeStatus,
} from "./backup-codes.service.js";
import type { ClientContext } from "./auth-session.types.js";
import { AuthAuditService } from "./auth-audit.service.js";

export const TOTP_ISSUER = "1CommandAI" as const;
export const TOTP_WINDOW = 1;
export { BACKUP_CODE_COUNT };

export type TotpSetupResult = {
  /** Base32 secret for manual entry (Google Authenticator compatible). */
  secret: string;
  /** Data URL PNG QR code for scanning. */
  qrCode: string;
};

export type TotpVerifyResult = {
  mfa_enabled: true;
  backupCodes: string[];
  backup_codes_status: BackupCodeStatus;
};

export type RegenerateBackupCodesResult = {
  backupCodes: string[];
  backup_codes_status: BackupCodeStatus;
};

export class MfaNotPendingError extends Error {
  constructor() {
    super("TOTP setup has not been started");
    this.name = "MfaNotPendingError";
  }
}

export class MfaAlreadyEnabledError extends Error {
  constructor() {
    super("TOTP MFA is already enabled");
    this.name = "MfaAlreadyEnabledError";
  }
}

export class MfaNotEnabledError extends Error {
  constructor() {
    super("TOTP MFA is not enabled");
    this.name = "MfaNotEnabledError";
  }
}

export class InvalidMfaTokenError extends Error {
  constructor() {
    super("Invalid TOTP or backup code");
    this.name = "InvalidMfaTokenError";
  }
}

@injectable()
export class MfaService {
  constructor(
    @inject(BackupCodesService) private readonly backupCodes: BackupCodesService,
    @inject(AuthAuditService) private readonly authAudit: AuthAuditService,
  ) {}

  verifyTOTP(secretBase32: string, token: string): boolean {
    const result = speakeasy.totp.verify({
      secret: secretBase32,
      encoding: "base32",
      token,
      window: TOTP_WINDOW,
    });
    return result === true;
  }

  /** Start TOTP enrollment — secret stored encrypted until verified. */
  async setupTOTP(userId: string): Promise<TotpSetupResult> {
    const user = await UserModel.findOne({
      _id: userId,
      is_deleted: false,
    }).lean<IUser | null>();

    if (!user) {
      throw new Error("User not found");
    }
    if (user.mfa_enabled) {
      throw new MfaAlreadyEnabledError();
    }

    const secret = speakeasy.generateSecret({
      name: `${TOTP_ISSUER}:${user.email}`,
      issuer: TOTP_ISSUER,
      length: 32,
    });

    if (!secret.base32 || !secret.otpauth_url) {
      throw new Error("Failed to generate TOTP secret");
    }

    await UserModel.updateOne(
      { _id: userId },
      {
        $set: {
          "mfa.totp_secret_enc": encryptField(secret.base32),
          "mfa.totp_pending": true,
          "mfa.backup_codes": [],
          "mfa.backup_code_hashes": [],
        },
      },
    );

    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    return {
      secret: secret.base32,
      qrCode,
    };
  }

  /**
   * Confirm enrollment with a TOTP code; enables MFA and returns one-time backup codes.
   */
  async verifyAndEnableTOTP(
    userId: string,
    token: string,
    clientContext?: ClientContext,
  ): Promise<TotpVerifyResult> {
    const user = await UserModel.findOne({
      _id: userId,
      is_deleted: false,
    })
      .select("+mfa.totp_secret_enc")
      .lean<IUser | null>();

    if (!user?.mfa?.totp_pending || !user.mfa.totp_secret_enc) {
      throw new MfaNotPendingError();
    }

    const secretBase32 = decryptField(user.mfa.totp_secret_enc);
    if (!this.verifyTOTP(secretBase32, token)) {
      throw new InvalidMfaTokenError();
    }

    await UserModel.updateOne(
      { _id: userId },
      {
        $set: {
          mfa_enabled: true,
          "mfa.totp_pending": false,
        },
      },
    );

    const plainCodes = await this.backupCodes.generateBackupCodes(userId);

    await this.authAudit.logMfaEnabled(clientContext, {
      userId,
      orgId: String(user.org_id),
      method: "totp",
    });

    return {
      mfa_enabled: true,
      backupCodes: plainCodes,
      backup_codes_status: buildBackupCodeStatus(plainCodes.length),
    };
  }

  /** Disable TOTP after verifying current code (TOTP or backup). */
  async disableTOTP(userId: string, token: string, clientContext?: ClientContext): Promise<void> {
    const user = await UserModel.findOne({
      _id: userId,
      is_deleted: false,
      mfa_enabled: true,
    })
      .select("+mfa.totp_secret_enc")
      .lean<IUser | null>();

    if (!user?.mfa?.totp_secret_enc) {
      throw new MfaNotEnabledError();
    }

    const secretBase32 = decryptField(user.mfa.totp_secret_enc);
    const totpOk = this.verifyTOTP(secretBase32, token);
    const backupOk = !totpOk && (await this.backupCodes.useBackupCode(userId, token));

    if (!totpOk && !backupOk) {
      throw new InvalidMfaTokenError();
    }

    await UserModel.updateOne(
      { _id: userId },
      {
        $set: {
          mfa_enabled: false,
          "mfa.totp_pending": false,
          "mfa.backup_codes": [],
          "mfa.backup_code_hashes": [],
        },
        $unset: { "mfa.totp_secret_enc": "" },
      },
    );

    await this.authAudit.logMfaDisabled(clientContext, {
      userId,
      orgId: String(user.org_id),
      method: "totp",
    });
  }

  /**
   * Regenerate backup codes (invalidates all previous codes).
   * Requires a valid TOTP code from the authenticator app.
   */
  async regenerateBackupCodes(
    userId: string,
    totpToken: string,
  ): Promise<RegenerateBackupCodesResult> {
    const user = await UserModel.findOne({
      _id: userId,
      is_deleted: false,
      mfa_enabled: true,
    })
      .select("+mfa.totp_secret_enc")
      .lean<IUser | null>();

    if (!user?.mfa?.totp_secret_enc) {
      throw new MfaNotEnabledError();
    }

    const secretBase32 = decryptField(user.mfa.totp_secret_enc);
    if (!this.verifyTOTP(secretBase32, totpToken)) {
      throw new InvalidMfaTokenError();
    }

    const plainCodes = await this.backupCodes.generateBackupCodes(userId);

    return {
      backupCodes: plainCodes,
      backup_codes_status: buildBackupCodeStatus(plainCodes.length),
    };
  }

  /** Remaining backup codes and low-balance warning. */
  async getBackupCodeStatus(userId: string): Promise<BackupCodeStatus> {
    const user = await UserModel.findOne({
      _id: userId,
      is_deleted: false,
      mfa_enabled: true,
    }).lean<IUser | null>();

    if (!user) {
      throw new MfaNotEnabledError();
    }

    return this.backupCodes.statusFromUser(user);
  }

  /** Validate second factor at login (TOTP or single-use backup code). */
  async verifyLoginMfa(
    user: IUser & { mfa?: IUser["mfa"] },
    token: string,
  ): Promise<boolean> {
    if (!user.mfa_enabled || !user.mfa?.totp_secret_enc) {
      return true;
    }

    const secretBase32 = decryptField(user.mfa.totp_secret_enc);
    if (this.verifyTOTP(secretBase32, token)) {
      return true;
    }

    return this.backupCodes.useBackupCode(String(user._id), token);
  }
}
