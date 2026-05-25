import type { Request } from "express";

import type { ClientContext, SessionDevice, SessionLocation } from "./auth-session.types.js";

/** Parse User-Agent into device type, OS, and browser (no external dependency). */
export function parseUserAgent(userAgent: string | undefined): SessionDevice {
  if (!userAgent || userAgent.trim().length === 0) {
    return { type: "unknown", os: "Unknown", browser: "Unknown" };
  }

  const ua = userAgent;

  let type = "desktop";
  if (/ipad|tablet|kindle|playbook/i.test(ua)) {
    type = "tablet";
  } else if (/mobile|iphone|ipod|android.*mobile|windows phone/i.test(ua)) {
    type = "mobile";
  }

  let os = "Unknown";
  if (/windows nt/i.test(ua)) {
    os = "Windows";
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    os = "iOS";
  } else if (/android/i.test(ua)) {
    os = "Android";
  } else if (/mac os x|macintosh/i.test(ua)) {
    os = "macOS";
  } else if (/linux/i.test(ua)) {
    os = "Linux";
  } else if (/cros/i.test(ua)) {
    os = "Chrome OS";
  }

  let browser = "Unknown";
  if (/edg\//i.test(ua)) {
    browser = "Edge";
  } else if (/firefox\//i.test(ua)) {
    browser = "Firefox";
  } else if (/(opr\/|opera)/i.test(ua)) {
    browser = "Opera";
  } else if (/chrome\//i.test(ua) && !/edg/i.test(ua)) {
    browser = "Chrome";
  } else if (/safari\//i.test(ua) && !/chrome/i.test(ua)) {
    browser = "Safari";
  } else if (/msie|trident/i.test(ua)) {
    browser = "Internet Explorer";
  }

  return { type, os, browser };
}

/** Client IP from `X-Forwarded-For` (first hop) or socket address. */
export function resolveClientIp(req: Request): string {
  const forwarded = req.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first && first.length > 0) {
      return first;
    }
  }
  const realIp = req.get("x-real-ip");
  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }
  return req.socket.remoteAddress ?? "0.0.0.0";
}

/** Country/city from common CDN / edge headers when present. */
export function resolveLocation(req: Request): SessionLocation {
  const country =
    req.get("cf-ipcountry") ??
    req.get("x-vercel-ip-country") ??
    req.get("cloudfront-viewer-country") ??
    "Unknown";
  const city =
    req.get("cf-ipcity") ??
    req.get("x-vercel-ip-city") ??
    "Unknown";
  return {
    country: country === "Unknown" ? country : country.toUpperCase(),
    city,
  };
}

/** Extract device, IP, and location from an HTTP request. */
export function extractClientContext(req: Request): ClientContext {
  return {
    ip_address: resolveClientIp(req),
    device: parseUserAgent(req.get("user-agent")),
    location: resolveLocation(req),
  };
}
