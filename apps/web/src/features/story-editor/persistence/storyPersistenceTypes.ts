import type { Dispatch, SetStateAction } from 'react';
import type { InteractionContentPatch, Story, StoryGraphPositionPatch } from '@paralleax/shared';

export type StoryStateSetter = Dispatch<SetStateAction<Story | undefined>>;

export interface OptimisticGraphHistoryChange {
  undo: StoryGraphPositionPatch;
  redo: StoryGraphPositionPatch;
}

export interface TrackStorySaveOptions {
  graphHistoryChange?: OptimisticGraphHistoryChange;
}

export type TrackStorySave = <T>(
  operation: () => Promise<T>,
  options?: TrackStorySaveOptions,
) => Promise<T | undefined>;

export type MergeIncomingStory = (
  current: Story,
  incoming: Story,
  edited?: { interactionId: string; patch: InteractionContentPatch },
  options?: { preserveCurrentTriggers?: boolean },
) => Story;
