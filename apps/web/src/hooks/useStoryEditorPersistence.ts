import { useState } from 'react';
import type { Story } from '@paralleax/shared';
import { api } from '../api';
import { useStoryContextPersistence } from '../features/story-editor/persistence/storyContextPersistence';
import { useStoryGraphPersistence } from '../features/story-editor/persistence/storyGraphPersistence';
import { useStoryPersistenceLifecycle } from '../features/story-editor/persistence/useStoryPersistenceLifecycle';

export function useStoryEditorPersistence(storyId: string) {
  const [story, setStory] = useState<Story>();
  const persistence = useStoryPersistenceLifecycle({ storyId, story, setStory });

  async function renameStory(title: string) {
    const next = await persistence.trackSave(() => api.renameStory(storyId, title));
    if (!next) return;
    setStory((current) => (current ? persistence.mergeIncomingStory(current, next) : next));
  }

  async function updateStoryStartDateTime(startDateTime: string) {
    const next = await persistence.trackSave(() => api.updateStory(storyId, { startDateTime }));
    if (!next) return;
    setStory((current) => (current ? persistence.mergeIncomingStory(current, next) : next));
  }

  const graphPersistence = useStoryGraphPersistence({
    storyId,
    story,
    setStory,
    trackSave: persistence.trackSave,
    mergeIncomingStory: persistence.mergeIncomingStory,
    deletedTriggerIdsRef: persistence.deletedTriggerIdsRef,
    deletedTriggerInputKeysRef: persistence.deletedTriggerInputKeysRef,
  });

  const contextPersistence = useStoryContextPersistence({
    storyId,
    story,
    setStory,
    trackSave: persistence.trackSave,
  });

  return {
    story,
    setStory,
    error: persistence.error,
    saveStatus: persistence.saveStatus,
    realtimeStatus: persistence.realtimeStatus,
    beginLocalEdit: persistence.beginLocalEdit,
    endLocalEdit: persistence.endLocalEdit,
    retry: persistence.retry,
    renameStory,
    updateStoryStartDateTime,
    ...graphPersistence,
    ...contextPersistence,
  };
}
