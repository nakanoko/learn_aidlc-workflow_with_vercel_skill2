/**
 * Base class for business errors. All business-derived errors inherit from this.
 * The httpStatus is mapped to an HTTP response by withErrorHandler.
 */
export abstract class AppError extends Error {
  abstract readonly httpStatus: number;
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/** 400 Bad Request - validation failures, JSON parse failures, missing required headers. */
export class ValidationError extends AppError {
  readonly httpStatus = 400 as const;
  readonly code = 'VALIDATION_ERROR' as const;
}

/** 404 Not Found - resource not found or soft-deleted. */
export class NotFoundError extends AppError {
  readonly httpStatus = 404 as const;
  readonly code = 'NOT_FOUND' as const;
}

/** 409 Conflict - duplicate registration or state-transition not permitted. */
export class ConflictError extends AppError {
  readonly httpStatus = 409 as const;
  readonly code = 'CONFLICT' as const;
}

/** 422 Unprocessable Entity - business rule violation in current state (e.g. approve mismatch). */
export class UnprocessableError extends AppError {
  readonly httpStatus = 422 as const;
  readonly code = 'UNPROCESSABLE' as const;
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
