import assert from "node:assert/strict";
import { describe, test } from "node:test";
import Joi from "joi";
import { z } from "zod";

import {
  formatJoiDetails,
  formatZodDetails,
  validate,
  validateZodBody,
} from "./validation.middleware.js";

describe("validation.middleware", () => {
  test("formatJoiDetails maps path and message", () => {
    const { error } = Joi.object({ email: Joi.string().email().required() }).validate(
      { email: "bad" },
      { abortEarly: false },
    );
    assert.ok(error);
    const details = formatJoiDetails(error);
    assert.equal(details[0]?.field, "email");
    assert.ok(details[0]?.message.includes("email"));
  });

  test("formatZodDetails maps issues", () => {
    const parsed = z.object({ n: z.number() }).safeParse({ n: "x" });
    assert.ok(!parsed.success);
    const details = formatZodDetails(parsed.error);
    assert.equal(details[0]?.field, "n");
  });

  test("validate strips unknown body fields", () => {
    const schema = Joi.object({ a: Joi.string().required() });
    let body: unknown;
    const req = { body: { a: "ok", extra: 1 } };
    let statusCode = 0;
    const res = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    };
    validate(schema)(req as never, res as never, () => {
      body = req.body;
    });
    assert.equal(statusCode, 0);
    assert.deepEqual(body, { a: "ok" });
  });

  test("validateZodBody returns 400 on failure", () => {
    const schema = z.object({ id: z.string().length(24) });
    const req = { body: { id: "short" } };
    const res = {
      statusCode: 0,
      payload: undefined as { error: string; details: { field: string }[] } | undefined,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(p: typeof this.payload) {
        this.payload = p;
        return this;
      },
    };
    validateZodBody(schema)(req as never, res as never, () => undefined);
    assert.equal(res.statusCode, 400);
    assert.equal(res.payload?.error, "Validation Error");
    assert.ok((res.payload?.details.length ?? 0) > 0);
  });
});
