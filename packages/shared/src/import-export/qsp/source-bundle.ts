import type { QspLocationSourceFile } from './types.js';

const QSP_LOCATION_BUNDLE_VERSION = 1;

export function serializeQspLocationBundle(files: readonly QspLocationSourceFile[]) {
  return JSON.stringify({ version: QSP_LOCATION_BUNDLE_VERSION, files });
}

export function parseQspLocationBundle(content: string): QspLocationSourceFile[] {
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error('The QSP locations bundle is not valid JSON.');
  }
  if (!isRecord(value) || value.version !== QSP_LOCATION_BUNDLE_VERSION) {
    throw new Error('The QSP locations bundle version is not supported.');
  }
  if (!Array.isArray(value.files) || value.files.length === 0) {
    throw new Error('The QSP locations bundle does not contain any .qsrc file.');
  }
  const names = new Set<string>();
  return value.files.map((file) => {
    if (
      !isRecord(file) ||
      typeof file.name !== 'string' ||
      !file.name.trim() ||
      file.name.length > 500 ||
      !/\.qsrc$/i.test(file.name) ||
      typeof file.content !== 'string'
    ) {
      throw new Error('The QSP locations bundle contains an invalid source file.');
    }
    const normalizedName = file.name.trim().replace(/\\/g, '/').toLocaleLowerCase();
    if (names.has(normalizedName)) {
      throw new Error(`The QSP source file "${file.name}" is included more than once.`);
    }
    names.add(normalizedName);
    return { name: file.name.trim().replace(/\\/g, '/'), content: file.content };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
