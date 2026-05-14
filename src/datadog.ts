/**
 * Datadog APM (`dd-trace`). Import via `telemetry.ts` before Express.
 * @see https://docs.datadoghq.com/tracing/trace_collection/automatic_instrumentation/dd_libraries/nodejs/
 */
import tracer from "dd-trace";

const serviceName =
  process.env.DD_SERVICE ?? process.env.SERVICE_NAME ?? "platform-api";

const profilingEnabled =
  (process.env.DD_PROFILING_ENABLED ?? "true").toLowerCase() !== "false";

export function initDatadog(): void {
  tracer.init({
    service: serviceName,
    env: process.env.DD_ENV ?? process.env.DEPLOY_ENV,
    version: process.env.DD_VERSION ?? process.env.GIT_COMMIT_SHA,
    profiling: profilingEnabled,
    runtimeMetrics: true,
    logInjection: true,
    // Agent defaults: DD_AGENT_HOST, DD_TRACE_AGENT_PORT
  });
}

export { tracer };
