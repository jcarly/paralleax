/**
 * A violated domain rule. Framework-independent: the API exception filter maps it
 * to HTTP 400 with its stable `code` (ADR-046), and it is never captured as an
 * unexpected error.
 */
export class DomainValidationError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'DomainValidationError';
    this.code = code;
    this.details = details;
  }
}
