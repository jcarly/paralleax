import { useCallback } from 'react';
import { applyGroupResult } from '../../story/storyMutationResults';
import { api } from '../../../api';
import type { StoryStateSetter, TrackStorySave } from './storyPersistenceTypes';

interface StoryGroupPersistenceDependencies {
  storyId: string;
  setStory: StoryStateSetter;
  trackSave: TrackStorySave;
}

export function useStoryGroupPersistence({
  storyId,
  setStory,
  trackSave,
}: StoryGroupPersistenceDependencies) {
  const createGroup = useCallback(
    async (title: string, interactionIds: string[]) => {
      const result = await trackSave(() => api.createGroup(storyId, { title, interactionIds }));
      if (!result) return false;
      setStory((current) => (current ? applyGroupResult(current, result) : current));
      return true;
    },
    [setStory, storyId, trackSave],
  );

  return { createGroup };
}
