import { findDuplicateNativeStoryIdentifier } from './native-story-identifiers.js';
import { nativeStoryContentSchema } from './native-story-schema.js';
import { checkNativeStoryEnvelope, type NativeStoryContent } from './native-story.js';

export type NativeStoryStructureResult =
  | { status: 'structurally_valid'; story: NativeStoryContent }
  | { status: 'invalid'; code: 'INVALID_STRUCTURE' | 'DUPLICATE_IDENTIFIER'; path: string }
  | { status: 'unsupported_version'; version: number };

/** Validate structure and duplicate IDs only, before domain and reference validation. */
export function validateNativeStoryStructure(value: unknown): NativeStoryStructureResult {
  const envelope = checkNativeStoryEnvelope(value);
  if (envelope.status === 'invalid') {
    return { status: 'invalid', code: 'INVALID_STRUCTURE', path: '$' };
  }
  if (envelope.status === 'unsupported_version') {
    return envelope;
  }
  const parsed = nativeStoryContentSchema.safeParse(envelope.story);
  if (!parsed.success) {
    return {
      status: 'invalid',
      code: 'INVALID_STRUCTURE',
      path: jsonPath(parsed.error.issues[0]?.path ?? []),
    };
  }
  const nulPath = findNulCharacter(parsed.data);
  if (nulPath !== undefined) {
    return { status: 'invalid', code: 'INVALID_STRUCTURE', path: nulPath };
  }
  const duplicate = findDuplicateNativeStoryIdentifier(parsed.data);
  if (duplicate) {
    return { status: 'invalid', code: 'DUPLICATE_IDENTIFIER', path: duplicate.path };
  }
  return { status: 'structurally_valid', story: parsed.data };
}

function findNulCharacter(value: unknown): string | undefined {
  const pending: ValueEntry[] = [{ value, path: '$.story' }];
  while (pending.length > 0) {
    const entry = pending.pop();
    if (entry === undefined) {
      continue;
    }
    if (typeof entry.value === 'string' && entry.value.includes('\0')) {
      return entry.path;
    }
    addChildren(entry, pending);
  }
  return undefined;
}

type ValueEntry = { value: unknown; path: string };

function addChildren(entry: ValueEntry, pending: ValueEntry[]) {
  if (Array.isArray(entry.value)) {
    entry.value.forEach((item: unknown, index: number) => {
      pending.push({ value: item, path: `${entry.path}[${index}]` });
    });
  } else if (typeof entry.value === 'object' && entry.value !== null) {
    for (const [key, item] of Object.entries(entry.value)) {
      pending.push({ value: item, path: `${entry.path}.${key}` });
    }
  }
}

function jsonPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (current, part) =>
      typeof part === 'number' ? `${current}[${part}]` : `${current}.${String(part)}`,
    '$.story',
  );
}
