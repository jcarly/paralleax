export function parseQspStringLiteral(value: string): string | undefined {
  const quote = value[0];
  if (quote !== "'" && quote !== '"') {
    return undefined;
  }
  let result = '';
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] !== quote) {
      result += value[index];
      continue;
    }
    if (value[index + 1] === quote) {
      result += quote;
      index += 1;
      continue;
    }
    return result;
  }
  return undefined;
}

export function consumedLiteralLength(value: string): number {
  const quote = value[0];
  if (quote !== "'" && quote !== '"') {
    return 0;
  }
  for (let index = 1; index < value.length; index += 1) {
    if (value[index] !== quote) {
      continue;
    }
    if (value[index + 1] === quote) {
      index += 1;
      continue;
    }
    return index + 1;
  }
  return 0;
}
