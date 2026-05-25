import assert from "node:assert/strict";
import { test } from "node:test";

import { TokenReuseAlertService } from "./token-reuse-alert.service.js";

test("alertReuse writes security alert to stderr", async () => {
  const lines: string[] = [];
  const orig = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    lines.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;

  const alert = new TokenReuseAlertService();
  await alert.alertReuse({
    userId: "507f1f77bcf86cd799439011",
    orgId: "507f191e810c19729de860ea",
    jti: "stolen-jti",
  });

  process.stderr.write = orig;
  assert.match(lines.join(""), /\[AUTH ALERT\].*Refresh token reuse detected/);
  assert.match(lines.join(""), /stolen-jti/);
});
