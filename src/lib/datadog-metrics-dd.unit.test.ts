/**
 * Isolated from `datadog-metrics.unit.test.ts` because `jest.resetModules()` must run
 * before any static import of `./datadog-metrics`.
 */
describe("datadog-metrics (Datadog path)", () => {
  const prevApm = process.env.APM_PROVIDER;

  afterAll(() => {
    process.env.APM_PROVIDER = prevApm;
  });

  it("registers finish handler and completes a request", async () => {
    jest.resetModules();
    delete process.env.APM_PROVIDER;

    require("../telemetry");
    const express = require("express") as typeof import("express");
    const request = require("supertest") as typeof import("supertest");
    const {
      datadogRequestMetricsMiddleware,
      incrementCreditConsumed,
      incrementSignalProcessed,
    } = require("./datadog-metrics") as typeof import("./datadog-metrics");

    const app = express();
    app.use(datadogRequestMetricsMiddleware);
    app.get(
      "/dd",
      (_req: unknown, res: { sendStatus: (c: number) => void }) => {
        res.sendStatus(201);
      },
    );

    await request(app).get("/dd").expect(201);
    incrementCreditConsumed(1);
    incrementCreditConsumed(2, { ok: true, no: false });
    incrementSignalProcessed();

    const router = express.Router();
    router.get(
      "/item/:id",
      (_req: unknown, res: { sendStatus: (c: number) => void }) => {
        res.sendStatus(200);
      },
    );
    const app2 = express();
    app2.use(datadogRequestMetricsMiddleware);
    app2.use("/api", router);
    await request(app2).get("/api/item/42").expect(200);
  });
});
