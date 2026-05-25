import type { NextFunction, Request, RequestHandler, Response } from "express";

import { config } from "@config/index.js";

import { RATE_LIMITS } from "./rate-limits.config.js";

export type RateLimitHeaderSnapshot = {
  limit: number;
  remaining: number;
  reset: number;
};

declare global {
  namespace Express {
    interface Locals {
      rateLimitHeaders?: RateLimitHeaderSnapshot;
    }
  }
}

/** Applies `X-RateLimit-*` from `res.locals.rateLimitHeaders` or policy defaults. */
export function createRateLimitHeadersMiddleware(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!res.getHeader("X-RateLimit-Limit")) {
      const snap = res.locals.rateLimitHeaders;
      const nowSec = Math.floor(Date.now() / 1000);
      if (snap) {
        res.set("X-RateLimit-Limit", String(snap.limit));
        res.set("X-RateLimit-Remaining", String(snap.remaining));
        res.set("X-RateLimit-Reset", String(snap.reset));
      } else if (config.rateLimit.enabled) {
        const limit = config.rateLimit.userMax;
        res.set("X-RateLimit-Limit", String(limit));
        res.set("X-RateLimit-Remaining", String(limit));
        res.set("X-RateLimit-Reset", String(nowSec + RATE_LIMITS.default.window));
      }
    }
    next();
  };
}

export function setRateLimitHeaders(
  res: Response,
  limit: number,
  remaining: number,
  resetSec: number,
): void {
  const snap: RateLimitHeaderSnapshot = { limit, remaining, reset: resetSec };
  res.locals.rateLimitHeaders = snap;
  res.set("X-RateLimit-Limit", String(limit));
  res.set("X-RateLimit-Remaining", String(remaining));
  res.set("X-RateLimit-Reset", String(resetSec));
}
