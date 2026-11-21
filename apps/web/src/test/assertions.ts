/** Require a value that a test expects to exist, while narrowing its type. */
export function requireValue<T>(value: T | null | undefined, description: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${description} to exist`);
  }
  return value;
}
