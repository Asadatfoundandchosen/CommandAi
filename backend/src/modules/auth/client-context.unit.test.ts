import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseUserAgent,
  resolveClientIp,
  resolveLocation,
} from "./client-context.js";

test("parseUserAgent detects Chrome on Windows desktop", () => {
  const ua =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
  const device = parseUserAgent(ua);
  assert.equal(device.type, "desktop");
  assert.equal(device.os, "Windows");
  assert.equal(device.browser, "Chrome");
});

test("parseUserAgent detects mobile Safari on iOS", () => {
  const ua =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  const device = parseUserAgent(ua);
  assert.equal(device.type, "mobile");
  assert.equal(device.os, "iOS");
  assert.equal(device.browser, "Safari");
});

test("resolveLocation reads Cloudflare country header", () => {
  const req = {
    get(name: string) {
      if (name === "cf-ipcountry") {
        return "us";
      }
      if (name === "cf-ipcity") {
        return "Austin";
      }
      return undefined;
    },
  } as import("express").Request;
  assert.deepEqual(resolveLocation(req), { country: "US", city: "Austin" });
});

test("resolveClientIp uses first X-Forwarded-For hop", () => {
  const req = {
    get(name: string) {
      if (name === "x-forwarded-for") {
        return "203.0.113.1, 10.0.0.1";
      }
      return undefined;
    },
    socket: { remoteAddress: "127.0.0.1" },
  } as import("express").Request;
  assert.equal(resolveClientIp(req), "203.0.113.1");
});
