/**
 * Single entry for APM: Datadog (`dd-trace`) by default, or OpenTelemetry when `APM_PROVIDER=otel`.
 * Uses conditional `require` so the unused stack is not loaded (avoids double instrumentation).
 */
const useOtel = (process.env.APM_PROVIDER ?? "").toLowerCase() === "otel";

if (useOtel) {
  const { startOpenTelemetry } =
    require("./instrumentation") as typeof import("./instrumentation");
  startOpenTelemetry();
} else {
  const { initDatadog } = require("./datadog") as typeof import("./datadog");
  initDatadog();
}
