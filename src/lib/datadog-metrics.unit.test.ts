import request from "supertest";
import express from "express";
import {
  datadogRequestMetricsMiddleware,
  incrementCreditConsumed,
  incrementSignalProcessed,
} from "./datadog-metrics";

describe("datadog-metrics (APM_PROVIDER=otel)", () => {
  const prev = process.env.APM_PROVIDER;

  beforeEach(() => {
    process.env.APM_PROVIDER = "otel";
  });

  afterAll(() => {
    process.env.APM_PROVIDER = prev;
  });

  it("middleware completes requests", async () => {
    const app = express();
    app.use(datadogRequestMetricsMiddleware);
    app.get("/z", (_req, res) => {
      res.sendStatus(200);
    });
    await request(app).get("/z").expect(200);
  });

  it("custom metric helpers are safe to call", () => {
    incrementCreditConsumed(3, { org: "o1" });
    incrementSignalProcessed({ kind: "test" });
  });
});
