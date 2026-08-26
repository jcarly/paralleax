import type { Dispatch, SetStateAction } from 'react';
import type { InteractionContentPatch, Story } from '@paralleax/shared';

export type StoryStateSetter = Dispatch<SetStateAction<Story | undefined>>;

export type TrackStorySave = <T>(operation: () => Promise<T>) => Promise<T | undefined>;

export type MergeIncomingStory = (
  current: Story,
  incoming: Story,
  edited?: { interactionId: string; patch: InteractionContentPatch },
  options?: { preserveCurrentTriggers?: boolean },
) => Story;
