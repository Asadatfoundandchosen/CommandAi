import type { Request, RequestHandler } from "express";
import type { ZodError, ZodType } from "zod";

import { type EventHandler, eventBus } from "./event-bus.js";
import type { EventName } from "./event-types.js";

export type ParseEventResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ZodError };

/** Validate unknown input (e.g. HTTP body, queue message) against a schema. */
export function parseEvent<T>(schema: ZodType<T>, input: unknown): ParseEventResult<T> {
  const r = schema.safeParse(input);
  if (r.success) {
    return { ok: true, data: r.data };
  }
  return { ok: false, error: r.error };
}

/** Parse or throw — use at boundaries when invalid data should fail fast. */
export function parseEventOrThrow<T>(schema: ZodType<T>, input: unknown): T {
  return schema.parse(input);
}

/**
 * Subscribe with Zod validation: invalid payloads are rejected (logged) and not passed to the handler.
 */
export function onValidatedEvent<E>(
  event: EventName,
  schema: ZodType<E>,
  handler: EventHandler<E>,
): void {
  eventBus.on(event, async (payload: unknown) => {
    const r = schema.safeParse(payload);
    if (!r.success) {
      process.stderr.write(
        `Event validation failed for ${event}: ${r.error.message}\n`,
      );
      return;
    }
    await handler(r.data);
  });
}

/** Emit after validating the full envelope matches the schema. */
export function emitValidatedEvent<E>(
  event: EventName,
  schema: ZodType<E>,
  data: unknown,
): boolean {
  const r = schema.safeParse(data);
  if (!r.success) {
    process.stderr.write(
      `emitValidatedEvent: validation failed for ${event}: ${r.error.message}\n`,
    );
    return false;
  }
  return eventBus.emit(event, r.data);
}

/**
 * Express middleware: parse `req.body` with the given Zod schema and attach `validatedEvent` on the request.
 * Use for HTTP ingress that maps to domain events (webhooks, internal event API).
 */
export function createEventBodyValidator<T>(schema: ZodType<T>): RequestHandler {
  return (req, res, next) => {
    const r = schema.safeParse(req.body);
    if (!r.success) {
      res.status(400).json({
        error: "Invalid event payload",
        details: r.error.flatten(),
      });
      return;
    }
    (req as Request & { validatedEvent: T }).validatedEvent = r.data;
    next();
  };
}
