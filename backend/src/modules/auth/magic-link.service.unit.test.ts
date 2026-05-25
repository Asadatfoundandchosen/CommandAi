import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAGIC_LINK_SEND_RATE_MAX,
  MAGIC_LINK_TTL_SEC,
  magicLinkSendRateKey,
  magicLinkTokenKey,
} from "./magic-link.constants.js";
import { buildMagicLinkUrl } from "./magic-link.service.js";

test("magic link Redis key and TTL constants", () => {
  assert.equal(MAGIC_LINK_TTL_SEC, 900);
  assert.equal(MAGIC_LINK_SEND_RATE_MAX, 5);
  assert.equal(magicLinkTokenKey("abc123"), "magic:abc123");
  assert.equal(
    magicLinkSendRateKey("user@example.com"),
    "magic_send_rate:user@example.com",
  );
});

test("buildMagicLinkUrl encodes token and uses app base URL", () => {
  const url = buildMagicLinkUrl("deadbeef");
  assert.match(url, /\/auth\/magic\?token=deadbeef$/);
  assert.ok(url.startsWith("http"));
});

test("buildMagicLinkUrl encodes special characters in token", () => {
  const url = buildMagicLinkUrl("a+b/c=");
  assert.ok(url.includes("token="));
  assert.ok(url.includes(encodeURIComponent("a+b/c=")));
});
