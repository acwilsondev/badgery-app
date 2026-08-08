import type { Request, Response, NextFunction } from "express";
import * as z from "zod";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
  }
}

export class NotFoundError extends ApiError {
  constructor(message = "Not found") {
    super(message, 404, "NOT_FOUND");
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = "Not authenticated") {
    super(message, 401, "UNAUTHORIZED");
  }
}

// Spec-mandated (Phase 3's three named error types include this one), kept
// for a service that wants to throw a non-zod validation failure directly.
// None of this phase's 25 routes currently need it — every validation path
// goes through zod's own .parse(), which throws z.ZodError and is handled
// by its own branch in errorHandler below, not by this class.
export class ValidationError extends ApiError {
  errors: unknown;

  constructor(errors: unknown, message = "Validation failed") {
    super(message, 400, "VALIDATION_ERROR");
    this.errors = errors;
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  // Every feature route calls schema.parse(req.body) directly (no route
  // ever catches ZodError itself) — zod throws its own z.ZodError, not one
  // of our ApiError subclasses, so it needs its own branch here rather than
  // being converted to ValidationError at each call site. Same response
  // shape ValidationError produces: existing tests assert
  // Array.isArray(res.body.errors), and err.errors is still the raw zod
  // issues array either way.
  if (err instanceof z.ZodError) {
    return res.status(400).json({
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      errors: err.errors,
    });
  }
  if (err instanceof ValidationError) {
    return res
      .status(err.status)
      .json({ message: err.message, code: err.code, errors: err.errors });
  }
  if (err instanceof ApiError) {
    return res
      .status(err.status)
      .json({ message: err.message, code: err.code });
  }
  console.error("Unhandled error:", err);
  return res
    .status(500)
    .json({ message: "Internal server error", code: "INTERNAL_ERROR" });
}
