import type { ErrorRequestHandler, RequestHandler } from "express";
import { ZodError } from "zod";
import { ConflictError, HttpError, NotFoundError } from "../errors.js";

const SQLITE_CONSTRAINT_UNIQUE = 2067;

export const rejectUnknownRoute: RequestHandler = (req) => {
  throw new NotFoundError(`Route ${req.method} ${req.path} not found`);
};

/** Every error leaves the API in the same JSON shape: { error: { code, message, details?, requestId } }. */
export const sendErrorAsJson: ErrorRequestHandler = (err, _req, res, _next) => {
  const httpError = toHttpError(err);
  const requestId = res.locals.requestId;

  // Unexpected errors are logged with the request id; their details never reach the client.
  if (httpError.status >= 500) {
    console.error(`[${requestId}]`, err);
  }

  const body: Record<string, unknown> = {
    code: httpError.code,
    message: httpError.message,
  };
  if (httpError.details !== undefined) {
    body.details = httpError.details;
  }
  body.requestId = requestId;

  res.status(httpError.status).json({ error: body });
};

/** Translates any thrown error into an HttpError with a status code and error code. */
function toHttpError(err: unknown): HttpError {
  // Already an HTTP error (404, 409, 412, ...): use it as is.
  if (err instanceof HttpError) {
    return err;
  }

  // Invalid body, query or path parameter (thrown by schema.parse()).
  if (err instanceof ZodError) {
    const fieldErrors = err.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return new HttpError(400, "VALIDATION_ERROR", "Request validation failed", fieldErrors);
  }

  // Malformed JSON body (thrown by express.json()).
  if (isObject(err) && err.type === "entity.parse.failed") {
    return new HttpError(400, "INVALID_JSON", "Request body is not valid JSON");
  }
  if (isObject(err) && err.type === "entity.too.large") {
    return new HttpError(413, "PAYLOAD_TOO_LARGE", "Request body is too large");
  }

  // The database rejected a duplicate SKU (UNIQUE constraint).
  if (isObject(err) && err.errcode === SQLITE_CONSTRAINT_UNIQUE) {
    return new ConflictError("A product with this SKU already exists");
  }

  // Anything else is a bug or an infrastructure problem.
  return new HttpError(500, "INTERNAL_ERROR", "Internal server error");
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
