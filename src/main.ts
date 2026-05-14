import "./telemetry";
import { randomUUID } from "node:crypto";
import express from "express";
import pinoHttp from "pino-http";
import * as client from "prom-client";
import { datadogRequestMetricsMiddleware } from "./lib/datadog-metrics";
import { logger } from "./lib/logger";
import { traceContextMiddleware } from "./lib/trace-middleware";

const app = express();
const port = Number(process.env.PORT ?? 3000);

client.collectDefaultMetrics();

const httpRequestDurationSeconds = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2.5, 5, 10],
});

app.use(
  pinoHttp({
    logger,
    genReqId: (req) => {
      const h = req.headers["x-trace-id"] ?? req.headers["x-request-id"];
      return typeof h === "string" && h.length > 0 ? h : randomUUID();
    },
    customProps: (req) => ({
      trace_id: req.id,
      org_id: String(req.headers["x-org-id"] ?? ""),
    }),
    autoLogging: {
      ignore: (req) => req.url === "/metrics" || req.url === "/health",
    },
  }),
);

app.use(traceContextMiddleware);

app.use(datadogRequestMetricsMiddleware);

app.use((req, res, next) => {
  const end = httpRequestDurationSeconds.startTimer();
  res.on("finish", () => {
    const route = req.route?.path ?? req.path;
    end({
      method: req.method,
      route: typeof route === "string" ? route : req.path,
      status_code: String(res.statusCode),
    });
  });
  next();
});

app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", service: "api" });
});

app.get("/metrics", async (_req, res) => {
  try {
    res.setHeader("Content-Type", client.register.contentType);
    res.status(200).send(await client.register.metrics());
  } catch (err) {
    res.status(500).send(err instanceof Error ? err.message : "metrics error");
  }
});

app.get("/", (_req, res) => {
  res.status(200).send("1CommandAI API");
});

app.listen(port, "0.0.0.0", () => {
  logger.info({ message: `API listening on ${port}` });
});
