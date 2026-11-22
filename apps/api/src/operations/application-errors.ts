/**
 * An expected application error with a stable `code` and optional `details`
 * (ADR-046). The API exception filter maps each subclass to its HTTP status and
 * never captures it as an unexpected error.
 */
export abstract class ApplicationError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

/** A request conflicting with the current state, for example a stale revision: 409. */
export class ApplicationConflictError extends ApplicationError {
  override readonly name = 'ApplicationConflictError';
}

/** A missing resource that is not a Story, for example an expired proposal: 404. */
export class ApplicationNotFoundError extends ApplicationError {
  override readonly name = 'ApplicationNotFoundError';
}
