export function escapeImportedHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function truncateImportedText(value: string, length: number) {
  return value.length <= length ? value : `${value.slice(0, Math.max(0, length - 1)).trimEnd()}…`;
}

export function uniqueImportedValues(values: string[]) {
  return [...new Set(values)];
}
