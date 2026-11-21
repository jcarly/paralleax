/** Require an identifier or value that import mapping invariants guarantee exists. */
export function requireMappedValue<T>(value: T | undefined, description: string): T {
  if (value === undefined) {
    throw new Error(`Expected ${description} to exist in the import mapping.`);
  }
  return value;
}
