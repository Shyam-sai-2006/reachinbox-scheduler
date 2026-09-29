import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction,
): void {
  // Never expose credentials, stack traces, or sensitive connection info in error responses
  const statusCode = err.statusCode || (err instanceof ZodError ? 400 : 500);
  const code =
    err.code ||
    (err instanceof ZodError ? "VALIDATION_ERROR" : "INTERNAL_SERVER_ERROR");

  let message = err.message || "An unexpected internal error occurred";
  let details: unknown = err.details;

  if (err instanceof ZodError) {
    message = "Validation failed";
    details = err.errors.map((e) => ({
      path: e.path.join("."),
      message: e.message,
    }));
  }

  // Filter out any connection strings or sensitive keywords if present in message
  const sanitizedMessage = message
    .replace(/postgresql:\/\/[^@]+@/gi, "postgresql://***:***@")
    .replace(/redis:\/\/[^@]+@/gi, "redis://***:***@");

  console.error(
    `[API ERROR] ${req.method} ${req.originalUrl} - [${code}]:`,
    sanitizedMessage,
  );

  res.status(statusCode).json({
    success: false,
    error: {
      code,
      message: sanitizedMessage,
      ...(details ? { details } : {}),
    },
  });
}
