/**
 * @deprecated Use `PasswordService` from `@modules/auth/password.service.js` (Argon2id).
 * Legacy scrypt helpers retained for tests only.
 */
export {
  hashPassword,
  verifyPassword,
} from "./user.password.legacy.js";
