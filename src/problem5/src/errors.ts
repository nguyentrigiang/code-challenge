export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export class NotFoundError extends HttpError {
  constructor(message = "Resource not found") {
    super(404, "NOT_FOUND", message);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, "CONFLICT", message);
  }
}

export class PreconditionFailedError extends HttpError {
  constructor(message: string, details?: unknown) {
    super(412, "PRECONDITION_FAILED", message, details);
  }
}
