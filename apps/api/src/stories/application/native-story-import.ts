import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  NATIVE_STORY_FORMAT,
  NATIVE_STORY_VERSION,
  NATIVE_STORY_FILE_LIMIT_BYTES,
  remapNativeStoryContent,
  type NativeStoryContent,
  type NativeStoryIdMaps,
  type Story,
} from '@paralleax/shared';
import { sanitizeAndRemapStoryRichText } from '../rich-text';
import { measureStoryQuotaUsage } from '../story-quotas';
import { validateNativeStoryCore } from '../validation/native-story-core-validation';
import { StoryGraphService } from './story-graph';
import {
  NATIVE_STORY_IMPORT_PORT,
  NativeStoryIdAllocationError,
  type NativeStoryImportPort,
} from './native-story-import.port';

export const NATIVE_STORY_FILE_LIMIT = NATIVE_STORY_FILE_LIMIT_BYTES;

export class NativeStoryImportError extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}

@Injectable()
export class NativeStoryImportService {
  constructor(
    @Inject(NATIVE_STORY_IMPORT_PORT) private readonly repository: NativeStoryImportPort,
    private readonly graph: StoryGraphService,
  ) {}

  preview(bytes: Uint8Array) {
    return summarize(this.validate(parseFile(bytes)));
  }

  async create(bytes: Uint8Array, ownerId: string) {
    const content = this.validate(parseFile(bytes));
    const storyId = randomUUID();
    const now = new Date().toISOString();
    let story: Story;
    try {
      story = await this.repository.createNativeStory({
        content,
        storyId,
        ownerId,
        prepare: (maps) => this.prepare(content, maps, storyId, now),
      });
    } catch (error) {
      if (error instanceof NativeStoryIdAllocationError || isUniqueViolation(error)) {
        throw new NativeStoryImportError(
          'ID_COLLISION',
          '$',
          'A Story identifier became unavailable during import. Try again.',
        );
      }
      throw error;
    }
    return { id: story.id, ...summarize(story) };
  }

  private prepare(
    content: NativeStoryContent,
    maps: NativeStoryIdMaps,
    storyId: string,
    now: string,
  ): Story {
    const remapped = remapNativeStoryContent(content, maps, sanitizeAndRemapStoryRichText);
    const validated = this.validate({
      format: NATIVE_STORY_FORMAT,
      version: NATIVE_STORY_VERSION,
      story: remapped,
    });
    return { ...validated, id: storyId, revision: 1, createdAt: now, updatedAt: now };
  }

  private validate(value: unknown): NativeStoryContent {
    const result = validateNativeStoryCore(value, this.graph);
    if (result.status === 'unsupported_version') {
      throw new NativeStoryImportError(
        'UNSUPPORTED_VERSION',
        '$.version',
        'This Story version is not supported.',
      );
    }
    if (result.status === 'invalid') {
      throw new NativeStoryImportError(result.code, result.path, result.message);
    }
    return result.story;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function parseFile(bytes: Uint8Array): unknown {
  if (bytes.byteLength > NATIVE_STORY_FILE_LIMIT) {
    throw new NativeStoryImportError(
      'STORY_FILE_TOO_LARGE',
      '$',
      'The Story file exceeds the upload limit.',
    );
  }
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    return value;
  } catch {
    throw new NativeStoryImportError(
      'INVALID_STRUCTURE',
      '$',
      'The Story file must contain valid UTF-8 JSON.',
    );
  }
}

function summarize(content: NativeStoryContent) {
  const story: Story = { ...content, id: 'native-preview', createdAt: '', updatedAt: '' };
  const counts = measureStoryQuotaUsage(story);
  return {
    title: content.title,
    interactionCount: counts.interactions,
    triggerCount: counts.triggers,
    characterCount: counts.characters,
    locationCount: counts.locations,
    itemDefinitionCount: counts.itemDefinitions,
    itemInstanceCount: counts.itemInstances,
    statDefinitionCount: counts.statDefinitions,
    statAssignmentCount: counts.statAssignments,
    groupCount: counts.groups,
    graphDecorationCount: counts.graphDecorations,
  };
}
