import { scryptSync, timingSafeEqual } from "node:crypto";
import { injectable } from "inversify";
import argon2 from "argon2";
import zxcvbn from "zxcvbn";

/** Minimum zxcvbn score (0–4); **3** = reasonably strong. */
export const MIN_PASSWORD_STRENGTH_SCORE = 3;

export type PasswordValidationFeedback = {
  warning: string;
  suggestions: string[];
};

export type PasswordValidationResult =
  | { valid: true }
  | { valid: false; feedback: PasswordValidationFeedback };

export class WeakPasswordError extends Error {
  readonly feedback: PasswordValidationFeedback;

  constructor(feedback: PasswordValidationFeedback) {
    super("Password does not meet strength requirements");
    this.name = "WeakPasswordError";
    this.feedback = feedback;
  }
}

function isLegacyScryptHash(stored: string): boolean {
  const parts = stored.split(":");
  return parts.length === 2 && /^[0-9a-f]+$/i.test(parts[0]) && /^[0-9a-f]+$/i.test(parts[1]);
}

function verifyLegacyScrypt(plain: string, stored: string): boolean {
  if (!isLegacyScryptHash(stored)) {
    return false;
  }
  const [saltHex, keyHex] = stored.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const expectedKey = Buffer.from(keyHex, "hex");
  const key = scryptSync(plain, salt, expectedKey.length);
  if (key.length !== expectedKey.length) {
    return false;
  }
  return timingSafeEqual(key, expectedKey);
}

function mapZxcvbnFeedback(
  feedback: zxcvbn.ZXCVBNFeedback,
): PasswordValidationFeedback {
  return {
    warning: feedback.warning ?? "Password is too weak",
    suggestions: feedback.suggestions ?? [],
  };
}

@injectable()
export class PasswordService {
  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  async verifyPassword(password: string, hash: string): Promise<boolean> {
    if (hash.startsWith("$argon2")) {
      try {
        return await argon2.verify(hash, password);
      } catch {
        return false;
      }
    }
    return verifyLegacyScrypt(password, hash);
  }

  /** Returns whether the stored hash uses legacy scrypt (migration / forced rotation). */
  needsPasswordUpgrade(hash: string): boolean {
    return !hash.startsWith("$argon2");
  }

  validatePasswordStrength(
    password: string,
    userInputs: string[] = [],
  ): PasswordValidationResult {
    const result = zxcvbn(password, userInputs.filter((s) => s.length > 0));
    if (result.score < MIN_PASSWORD_STRENGTH_SCORE) {
      return {
        valid: false,
        feedback: mapZxcvbnFeedback(result.feedback),
      };
    }
    return { valid: true };
  }

  assertPasswordStrength(password: string, userInputs: string[] = []): void {
    const check = this.validatePasswordStrength(password, userInputs);
    if (!check.valid) {
      throw new WeakPasswordError(check.feedback);
    }
  }
}
