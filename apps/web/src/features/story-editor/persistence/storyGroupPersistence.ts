import { useCallback } from 'react';
import type { UpdateGroupInput } from '@paralleax/shared';
import { applyGroupResult, applyGroupDeletionResult } from '../../story/storyMutationResults';
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
    async (title: string, interactionIds: string[], parentGroupId?: string) => {
      const result = await trackSave(() =>
        api.createGroup(storyId, {
          title,
          interactionIds,
          ...(parentGroupId ? { parentGroupId } : {}),
        }),
      );
      if (!result) return false;
      setStory((current) =>
        current?.id === storyId ? applyGroupResult(current, result) : current,
      );
      return result.group.id;
    },
    [setStory, storyId, trackSave],
  );

  const updateGroup = useCallback(
    async (groupId: string, input: UpdateGroupInput) => {
      const result = await trackSave(() => api.updateGroup(storyId, groupId, input));
      if (!result) return false;
      setStory((current) =>
        current?.id === storyId ? applyGroupResult(current, result) : current,
      );
      return true;
    },
    [setStory, storyId, trackSave],
  );
  const deleteGroup = useCallback(
    async (groupId: string) => {
      const result = await trackSave(() => api.deleteGroup(storyId, groupId));
      if (!result) return false;
      setStory((current) =>
        current?.id === storyId ? applyGroupDeletionResult(current, result) : current,
      );
      return true;
    },
    [setStory, storyId, trackSave],
  );
  return { createGroup, updateGroup, deleteGroup };
}
