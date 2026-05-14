/**
 * OpenTelemetry bootstrap (Jaeger/OTLP). Call `startOpenTelemetry()` from `telemetry.ts`
 * when `APM_PROVIDER=otel` so it loads before Express.
 * @see https://opentelemetry.io/docs/languages/js/getting-started/nodejs/
 */
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

/** 10% when `DEPLOY_ENV=prod`; 100% otherwise (override with `OTEL_TRACES_SAMPLER_ARG`). */
const ratio = Number.parseFloat(
  process.env.OTEL_TRACES_SAMPLER_ARG ??
    ((process.env.DEPLOY_ENV ?? "").toLowerCase() === "prod" ? "0.1" : "1"),
);

const tracesEndpoint =
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
  (process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? `${String(process.env.OTEL_EXPORTER_OTLP_ENDPOINT).replace(/\/$/, "")}/v1/traces`
    : "http://localhost:4318/v1/traces");

const traceExporter = new OTLPTraceExporter({
  url: tracesEndpoint,
});

const sdk = new NodeSDK({
  resource: new Resource({
    [ATTR_SERVICE_NAME]:
      process.env.OTEL_SERVICE_NAME ??
      process.env.SERVICE_NAME ??
      "platform-api",
  }),
  traceExporter,
  sampler: new ParentBasedSampler({
    root: new TraceIdRatioBasedSampler(Number.isFinite(ratio) ? ratio : 1),
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": { enabled: false },
    }),
  ],
});

export function startOpenTelemetry(): void {
  sdk.start();
  process.once("SIGTERM", () => {
    void sdk.shutdown().finally(() => process.exit(0));
  });
}
