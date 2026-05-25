import type { Schema } from "mongoose";

import {
  decryptField,
  encryptField,
  isEncryptedField,
  searchableFieldToken,
} from "./field-encryption.js";

export type EncryptedFieldSpec = {
  /** Application / document path for plaintext (e.g. `phone_number`, `oidc.client_secret`). */
  plaintextPath: string;
  /** MongoDB path for ciphertext (e.g. `phone_number_enc`). */
  encryptedPath: string;
  /** HMAC blind index path for exact-match queries (e.g. `phone_number_search`). */
  searchIndexPath?: string;
  /** Purpose label passed to `searchableFieldToken`. */
  searchPurpose?: string;
};

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") {
      return undefined;
    }
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    const next = cur[part];
    if (next == null || typeof next !== "object") {
      cur[part] = {};
    }
    cur = cur[part] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

function unsetByPath(obj: Record<string, unknown>, path: string): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!;
    const next = cur[part];
    if (next == null || typeof next !== "object") {
      return;
    }
    cur = next as Record<string, unknown>;
  }
  delete cur[parts[parts.length - 1]!];
}

function encryptPlaintextOnDocument(
  doc: Record<string, unknown>,
  spec: EncryptedFieldSpec,
): void {
  const raw = getByPath(doc, spec.plaintextPath);
  if (raw == null || raw === "") {
    return;
  }
  if (typeof raw !== "string") {
    return;
  }
  if (isEncryptedField(raw)) {
    return;
  }
  setByPath(doc, spec.encryptedPath, encryptField(raw));
  if (spec.searchIndexPath && spec.searchPurpose) {
    setByPath(
      doc,
      spec.searchIndexPath,
      searchableFieldToken(raw, spec.searchPurpose),
    );
  }
  unsetByPath(doc, spec.plaintextPath);
}

function decryptCiphertextOnDocument(
  doc: Record<string, unknown>,
  spec: EncryptedFieldSpec,
): void {
  const enc = getByPath(doc, spec.encryptedPath);
  if (typeof enc !== "string" || enc.length === 0) {
    return;
  }
  try {
    setByPath(doc, spec.plaintextPath, decryptField(enc));
  } catch {
    /* leave ciphertext path only — caller may handle legacy migration */
  }
}

function walkDocuments(
  result: unknown,
  fn: (doc: Record<string, unknown>) => void,
): void {
  if (result == null) {
    return;
  }
  if (Array.isArray(result)) {
    for (const item of result) {
      if (item && typeof item === "object") {
        fn(item as Record<string, unknown>);
      }
    }
    return;
  }
  if (typeof result === "object") {
    fn(result as Record<string, unknown>);
  }
}

/**
 * Mongoose plugin: encrypt configured fields on save; decrypt after reads.
 * Use `encryptFieldsForUpdate()` for `updateOne` / `updateMany` that bypass save hooks.
 */
export function mongooseFieldEncryptionPlugin(
  schema: Schema,
  options: { fields: EncryptedFieldSpec[] },
): void {
  const fields = options.fields;

  schema.pre("save", function saveEncrypt() {
    for (const spec of fields) {
      const raw = this.get(spec.plaintextPath) as unknown;
      if (raw == null || raw === "") {
        continue;
      }
      if (typeof raw !== "string" || isEncryptedField(raw)) {
        continue;
      }
      this.set(spec.encryptedPath, encryptField(raw));
      if (spec.searchIndexPath && spec.searchPurpose) {
        this.set(
          spec.searchIndexPath,
          searchableFieldToken(raw, spec.searchPurpose),
        );
      }
      this.set(spec.plaintextPath, undefined);
    }
  });

  const decryptAfterRead = function decryptAfterRead(
    result: unknown,
  ): void {
    walkDocuments(result, (doc) => {
      for (const spec of fields) {
        decryptCiphertextOnDocument(doc, spec);
      }
    });
  };

  schema.post("find", decryptAfterRead);
  schema.post("findOne", decryptAfterRead);
  schema.post("findOneAndUpdate", decryptAfterRead);
}

/** Build `$set` / `$unset` for encrypted fields in raw update operations. */
export function encryptFieldsForUpdate(
  fields: EncryptedFieldSpec[],
  values: Record<string, string | undefined>,
): { $set: Record<string, string>; $unset: Record<string, ""> } {
  const $set: Record<string, string> = {};
  const $unset: Record<string, ""> = {};

  for (const spec of fields) {
    const raw = values[spec.plaintextPath];
    if (raw === undefined) {
      continue;
    }
    if (raw === "" || raw === null) {
      $unset[spec.encryptedPath] = "";
      if (spec.searchIndexPath) {
        $unset[spec.searchIndexPath] = "";
      }
      $unset[spec.plaintextPath] = "";
      continue;
    }
    $set[spec.encryptedPath] = encryptField(raw);
    if (spec.searchIndexPath && spec.searchPurpose) {
      $set[spec.searchIndexPath] = searchableFieldToken(
        raw,
        spec.searchPurpose,
      );
    }
    $unset[spec.plaintextPath] = "";
  }

  return { $set, $unset };
}

export const USER_ENCRYPTED_FIELDS: EncryptedFieldSpec[] = [
  {
    plaintextPath: "phone_number",
    encryptedPath: "phone_number_enc",
    searchIndexPath: "phone_number_search",
    searchPurpose: "user.phone",
  },
  {
    plaintextPath: "ssn",
    encryptedPath: "ssn_enc",
    searchIndexPath: "ssn_search",
    searchPurpose: "user.ssn",
  },
  {
    plaintextPath: "mfa.totp_secret",
    encryptedPath: "mfa.totp_secret_enc",
  },
];

export const ORG_ENCRYPTED_FIELDS: EncryptedFieldSpec[] = [
  {
    plaintextPath: "oidc.client_secret",
    encryptedPath: "oidc.client_secret_enc",
  },
  {
    plaintextPath: "saml.sp_private_key",
    encryptedPath: "saml.sp_private_key_enc",
  },
];

export const CONNECTOR_ENCRYPTED_FIELDS: EncryptedFieldSpec[] = [
  {
    plaintextPath: "credentials",
    encryptedPath: "credentials_enc",
  },
];
