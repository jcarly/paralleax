import type { Story } from '../model/stories.js';

/** The versioned envelope for authored Story content, without access metadata. */
export const NATIVE_STORY_FORMAT = 'paralleax.story';
export const NATIVE_STORY_VERSION = 1;
export const NATIVE_STORY_FILE_LIMIT_BYTES = 33 * 1024 * 1024;

export type NativeStoryContent = Pick<
  Story,
  | 'title'
  | 'startDateTime'
  | 'locations'
  | 'characters'
  | 'stats'
  | 'statDefinitions'
  | 'itemDefinitions'
  | 'groups'
  | 'graphDecorations'
  | 'interactions'
>;

export interface NativeStoryFile {
  format: typeof NATIVE_STORY_FORMAT;
  version: typeof NATIVE_STORY_VERSION;
  story: NativeStoryContent;
}

export interface NativeStoryImportSummary {
  title: string;
  interactionCount: number;
  triggerCount: number;
  characterCount: number;
  locationCount: number;
  itemDefinitionCount: number;
  itemInstanceCount: number;
  statDefinitionCount: number;
  statAssignmentCount: number;
  groupCount: number;
  graphDecorationCount: number;
}

export interface NativeStoryImportResult extends NativeStoryImportSummary {
  id: string;
}

export type NativeStoryEnvelopeCheck =
  | { status: 'supported'; story: unknown }
  | { status: 'invalid' }
  | { status: 'unsupported_version'; version: number };

/** Check only the envelope. Content still requires structural and domain validation. */
export function checkNativeStoryEnvelope(value: unknown): NativeStoryEnvelopeCheck {
  if (!isRecord(value) || value.format !== NATIVE_STORY_FORMAT) {
    return { status: 'invalid' };
  }
  if (typeof value.version !== 'number' || !Number.isSafeInteger(value.version)) {
    return { status: 'invalid' };
  }
  if (value.version !== NATIVE_STORY_VERSION) {
    return { status: 'unsupported_version', version: value.version };
  }
  if (Object.keys(value).some((key) => !['format', 'version', 'story'].includes(key))) {
    return { status: 'invalid' };
  }
  if (!isRecord(value.story)) {
    return { status: 'invalid' };
  }
  return { status: 'supported', story: value.story };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
