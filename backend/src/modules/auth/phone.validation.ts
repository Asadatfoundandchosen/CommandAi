import { z } from "zod";

/** E.164 format: leading +, country code, 7–15 digits total. */
export const E164_PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

export const phoneNumberSchema = z
  .string()
  .trim()
  .regex(E164_PHONE_REGEX, "phone_number must be E.164 format (e.g. +14155552671)");

/** Normalize to E.164 (strip spaces/dashes; `+` prefix required). */
export function normalizePhoneNumber(phone: string): string {
  return phone.replace(/[\s()-]/g, "");
}

export function validatePhoneNumber(phone: string): string {
  return phoneNumberSchema.parse(normalizePhoneNumber(phone));
}
