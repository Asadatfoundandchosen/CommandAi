import type { NextFunction, Request, RequestHandler, Response } from "express";
import type Joi from "joi";
import type { ZodTypeAny } from "zod";

export type ValidationDetail = {
  field: string;
  message: string;
};

export type ValidationErrorBody = {
  error: "Validation Error";
  details: ValidationDetail[];
};

export function formatJoiDetails(error: Joi.ValidationError): ValidationDetail[] {
  return error.details.map((d) => ({
    field: d.path.join("."),
    message: d.message,
  }));
}

export function formatZodDetails(error: {
  issues: { path: (string | number)[]; message: string }[];
}): ValidationDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

function sendValidationError(res: Response, details: ValidationDetail[]): void {
  const body: ValidationErrorBody = {
    error: "Validation Error",
    details,
  };
  res.status(400).json(body);
}

type ValidationTarget = "body" | "query" | "params";

function getTarget(req: Request, target: ValidationTarget): unknown {
  if (target === "body") {
    return req.body;
  }
  if (target === "query") {
    return req.query;
  }
  return req.params;
}

function assignTarget(req: Request, target: ValidationTarget, value: unknown): void {
  if (target === "body") {
    req.body = value;
    return;
  }
  if (target === "query") {
    req.query = value as Request["query"];
    return;
  }
  req.params = value as Request["params"];
}

/**
 * Joi request validator (`abortEarly: false`, `stripUnknown: true`).
 * @example router.post('/', validate(createUserSchema), handler)
 */
export function validate(
  schema: Joi.ObjectSchema,
  target: ValidationTarget = "body",
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(getTarget(req, target), {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      sendValidationError(res, formatJoiDetails(error));
      return;
    }

    assignTarget(req, target, value);
    next();
  };
}

export const validateBody = (schema: Joi.ObjectSchema): RequestHandler =>
  validate(schema, "body");

export const validateQuery = (schema: Joi.ObjectSchema): RequestHandler =>
  validate(schema, "query");

export const validateParams = (schema: Joi.ObjectSchema): RequestHandler =>
  validate(schema, "params");

function validateZod(schema: ZodTypeAny, target: ValidationTarget): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(getTarget(req, target));
    if (!result.success) {
      sendValidationError(res, formatZodDetails(result.error));
      return;
    }
    assignTarget(req, target, result.data);
    next();
  };
}

/** Zod body validator (existing module schemas). */
export const validateZodBody = (schema: ZodTypeAny): RequestHandler =>
  validateZod(schema, "body");

export const validateZodQuery = (schema: ZodTypeAny): RequestHandler =>
  validateZod(schema, "query");

export const validateZodParams = (schema: ZodTypeAny): RequestHandler =>
  validateZod(schema, "params");
