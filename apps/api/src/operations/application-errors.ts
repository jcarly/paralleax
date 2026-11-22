/**
 * An expected conflict between a request and the current state, for example a
 * stale Story revision (ADR-046). The API exception filter maps it to HTTP 409
 * with its stable `code` and `details`, and never captures it as unexpected.
 */
export class ApplicationConflictError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApplicationConflictError';
    this.code = code;
    this.details = details;
  }
}
