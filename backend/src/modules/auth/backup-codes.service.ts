import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { injectable } from "inversify";
import argon2 from "argon2";

import type { IUser } from "@modules/user/user.model.js";
import { UserModel } from "@modules/user/user.model.js";

export const BACKUP_CODE_COUNT = 10;
/** Warn user when this many or fewer unused codes remain. */
export const BACKUP_CODE_LOW_WARNING_THRESHOLD = 3;

export type StoredBackupCode = {
  hash: string;
  used: boolean;
};

export type BackupCodeStatus = {
  remaining: number;
  total: number;
  low_warning: boolean;
};

@injectable()
export class BackupCodesService {
  /** Generate 10 single-use codes; store Argon2 hashes; return plaintext once. */
  async generateBackupCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: BACKUP_CODE_COUNT }, () =>
      randomBytes(4).toString("hex").toUpperCase(),
    );

    const hashedCodes = await Promise.all(
      codes.map((code) => argon2.hash(normalizeBackupCode(code))),
    );

    const backupCodes: StoredBackupCode[] = hashedCodes.map((hash) => ({
      hash,
      used: false,
    }));

    await UserModel.updateOne(
      { _id: userId, is_deleted: false },
      {
        $set: { "mfa.backup_codes": backupCodes },
        $unset: { "mfa.backup_code_hashes": "" },
      },
    );

    return codes;
  }

  /**
   * Consume a backup code at login or MFA disable.
   * Supports legacy `mfa.backup_code_hashes` (SHA-256) until regenerated.
   */
  async useBackupCode(userId: string, code: string): Promise<boolean> {
    const user = await UserModel.findOne({
      _id: userId,
      is_deleted: false,
    });
    if (!user) {
      return false;
    }

    const entries = user.mfa?.backup_codes ?? [];
    if (entries.length > 0) {
      const normalized = normalizeBackupCode(code);
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.used) {
          continue;
        }
        try {
          if (await argon2.verify(entry.hash, normalized)) {
            await UserModel.updateOne(
              { _id: userId, [`mfa.backup_codes.${i}.used`]: false },
              { $set: { [`mfa.backup_codes.${i}.used`]: true } },
            );
            return true;
          }
        } catch {
          continue;
        }
      }
      return false;
    }

    return this.consumeLegacyBackupCode(user, code);
  }

  statusFromUser(user: IUser): BackupCodeStatus {
    const entries = user.mfa?.backup_codes ?? [];
    if (entries.length > 0) {
      const remaining = entries.filter((e) => !e.used).length;
      return buildBackupCodeStatus(remaining);
    }

    const legacyRemaining = user.mfa?.backup_code_hashes?.length ?? 0;
    return buildBackupCodeStatus(legacyRemaining);
  }

  private async consumeLegacyBackupCode(user: IUser, code: string): Promise<boolean> {
    const hashes = user.mfa?.backup_code_hashes ?? [];
    const normalized = normalizeBackupCode(code);
    const index = hashes.findIndex((h) => verifyLegacyBackupCodeHash(normalized, h));
    if (index < 0) {
      return false;
    }

    const nextHashes = [...hashes];
    nextHashes.splice(index, 1);

    await UserModel.updateOne(
      { _id: user._id },
      { $set: { "mfa.backup_code_hashes": nextHashes } },
    );

    return true;
  }
}

export function normalizeBackupCode(code: string): string {
  return code.replace(/-/g, "").trim().toUpperCase();
}

export function buildBackupCodeStatus(remaining: number): BackupCodeStatus {
  return {
    remaining,
    total: BACKUP_CODE_COUNT,
    low_warning: remaining <= BACKUP_CODE_LOW_WARNING_THRESHOLD,
  };
}

/** Legacy SHA-256 hashes from pre–backup-codes.service enrollment. */
function verifyLegacyBackupCodeHash(code: string, hash: string): boolean {
  const computed = createHash("sha256").update(code).digest("hex");
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}
