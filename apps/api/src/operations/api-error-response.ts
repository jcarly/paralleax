export function apiErrorResponse(code: string, message: string, details?: unknown) {
  return { code, message, ...(details === undefined ? {} : { details }) };
}
