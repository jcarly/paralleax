/**
 * Serializes a JSON value with object keys in code-point order, so two equal
 * request bodies always produce the same text whatever their key order. Only
 * JSON values parsed from a request reach it: `undefined` object fields are
 * omitted, as in `JSON.stringify`.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item ?? null)).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(([, field]) => field !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries
      .map(([key, field]) => `${JSON.stringify(key)}:${canonicalJson(field)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}
