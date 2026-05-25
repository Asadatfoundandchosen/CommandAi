import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertKeyBelongsToOrg,
  sanitizeFilename,
  validateContentType,
  validateUploadSizeBytes,
} from "./file.presign-rules.js";
import { MAX_UPLOAD_BYTES } from "./file.constants.js";

test("sanitizeFilename strips path and control chars", () => {
  assert.equal(sanitizeFilename("../../etc/passwd"), "passwd");
  assert.equal(sanitizeFilename("doc.pdf"), "doc.pdf");
});

test("validateContentType rejects unknown types", () => {
  assert.throws(() => validateContentType("application/x-msdownload"));
  validateContentType("application/pdf");
});

test("validateUploadSizeBytes enforces 100MB max", () => {
  assert.throws(() => validateUploadSizeBytes(MAX_UPLOAD_BYTES + 1));
  assert.throws(() => validateUploadSizeBytes(0));
  validateUploadSizeBytes(MAX_UPLOAD_BYTES);
});

test("assertKeyBelongsToOrg accepts uploads/, audit-exports/, and audit-archives/ prefixes", () => {
  assert.doesNotThrow(() =>
    assertKeyBelongsToOrg("org1", "uploads/org1/uuid/file.pdf"),
  );
  assert.doesNotThrow(() =>
    assertKeyBelongsToOrg("org1", "audit-exports/org1/export.csv"),
  );
  assert.doesNotThrow(() =>
    assertKeyBelongsToOrg("org1", "audit-archives/org1/archive.jsonl"),
  );
  assert.throws(() => assertKeyBelongsToOrg("org1", "org1/other/file.pdf"));
  assert.throws(() => assertKeyBelongsToOrg("org1", "uploads/org2/x"));
});
