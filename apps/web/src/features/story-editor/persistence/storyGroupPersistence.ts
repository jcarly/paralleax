import { useCallback } from 'react';
import type { Story, UpdateGroupInput } from '@paralleax/shared';
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
      return (
        applySavedGroupMutation(storyId, setStory, result, applyGroupResult)?.group.id ?? false
      );
    },
    [setStory, storyId, trackSave],
  );

  const updateGroup = useCallback(
    async (groupId: string, input: UpdateGroupInput) => {
      const result = await trackSave(() => api.updateGroup(storyId, groupId, input));
      return applySavedGroupMutation(storyId, setStory, result, applyGroupResult) !== undefined;
    },
    [setStory, storyId, trackSave],
  );
  const deleteGroup = useCallback(
    async (groupId: string) => {
      const result = await trackSave(() => api.deleteGroup(storyId, groupId));
      return (
        applySavedGroupMutation(storyId, setStory, result, applyGroupDeletionResult) !== undefined
      );
    },
    [setStory, storyId, trackSave],
  );
  return { createGroup, updateGroup, deleteGroup };
}

function applySavedGroupMutation<T>(
  storyId: string,
  setStory: StoryStateSetter,
  result: T | undefined,
  apply: (story: Story, result: T) => Story,
): T | undefined {
  if (!result) {
    return undefined;
  }
  setStory((current) => (current?.id === storyId ? apply(current, result) : current));
  return result;
}
