import type { Request, Response, NextFunction } from "express";

type MetricTags = Record<string, string | number>;

function isOtelPath(): boolean {
  return (process.env.APM_PROVIDER ?? "").toLowerCase() === "otel";
}

function getDogstatsd():
  | {
      increment(
        stat: string,
        value?: number,
        tags?: MetricTags | string[],
      ): void;
      histogram(
        stat: string,
        value?: number,
        tags?: MetricTags | string[],
      ): void;
    }
  | undefined {
  if (isOtelPath()) return undefined;
  const { tracer } = require("../datadog") as typeof import("../datadog");
  return tracer.dogstatsd;
}

function normalizeTags(
  tags?: Record<string, string | number | boolean>,
): MetricTags | undefined {
  if (!tags) return undefined;
  const out: MetricTags = {};
  for (const [k, v] of Object.entries(tags)) {
    out[k] = typeof v === "boolean" ? (v ? 1 : 0) : v;
  }
  return out;
}

/** Increment when credits are consumed (call from billing/credit logic). */
export function incrementCreditConsumed(
  amount: number,
  tags?: Record<string, string | number | boolean>,
): void {
  const d = getDogstatsd();
  d?.increment("credit.consumed", amount, normalizeTags(tags));
}

/** Increment when a signal is processed (call from pipeline/workers). */
export function incrementSignalProcessed(
  tags?: Record<string, string | number | boolean>,
): void {
  const d = getDogstatsd();
  d?.increment("signal.processed", 1, normalizeTags(tags));
}

/** Express middleware: `api.request.count` and `api.request.duration` (ms). */
export function datadogRequestMetricsMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (isOtelPath()) {
    next();
    return;
  }
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const d = getDogstatsd();
    if (!d) return;
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const route = req.route?.path ?? req.path ?? "unknown";
    const tags: MetricTags = {
      method: req.method,
      route: typeof route === "string" ? route : String(route),
      status: res.statusCode,
    };
    d.increment("api.request.count", 1, tags);
    d.histogram("api.request.duration", durationMs, tags);
  });
  next();
}
