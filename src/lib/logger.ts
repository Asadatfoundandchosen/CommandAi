import pino from "pino";

const service = process.env.SERVICE_NAME ?? "platform-api";

/**
 * JSON logs for Loki/Promtail: timestamp, level, service, trace_id, org_id, message (+ pino extras).
 */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service },
  messageKey: "message",
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label: string) {
      return { level: label };
    },
    log(obj) {
      const o = obj as Record<string, unknown>;
      const { time, ...rest } = o;
      return { timestamp: time, ...rest };
    },
  },
});
