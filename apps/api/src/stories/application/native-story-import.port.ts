import type { NativeStoryContent, NativeStoryIdMaps, Story } from '@paralleax/shared';

export const NATIVE_STORY_IMPORT_PORT = Symbol('NATIVE_STORY_IMPORT_PORT');

export class NativeStoryIdAllocationError extends Error {}

export interface NativeStoryImportRequest {
  content: NativeStoryContent;
  storyId: string;
  ownerId: string;
  prepare: (maps: NativeStoryIdMaps) => Story;
}

/** The adapter plans collisions and saves the prepared Story in one transaction. */
export interface NativeStoryImportPort {
  createNativeStory(request: NativeStoryImportRequest): Promise<Story>;
}
