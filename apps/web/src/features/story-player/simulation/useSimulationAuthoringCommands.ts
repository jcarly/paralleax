import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type {
  Interaction,
  InteractionMutationResult,
  ReaderProgressState,
  Story,
} from '@paralleax/shared';
import { ensureStoryInteractionPositions } from '@paralleax/shared';
import { api } from '../../../api';
import { getStoryGraphClickCreationPosition } from '../../../storyGraphCreationLayout';
import {
  applyInteractionMutationResult,
  findSavedInteraction,
} from '../../story/storyMutationResults';
import { loadStoryRuntimeContext, loadStoryRuntimeSlice } from '../storyRuntimeLoader';

type MutationOptions = { retryable?: boolean };
type RunMutation = <T>(
  operation: () => Promise<T>,
  applyResult: (result: T) => void,
  options?: MutationOptions,
) => Promise<void>;
type InteractionContentPatch = Partial<
  Pick<Interaction, 'title' | 'body' | 'conditionalTextBlocks'>
>;

export function useSimulationAuthoringCommands({
  storyId,
  story,
  current,
  setStory,
  setEditingChoiceId,
  runMutation,
  getCurrentSession,
  applyReloadedStory,
}: {
  storyId: string;
  story: Story | undefined;
  current: Interaction | undefined;
  setStory: Dispatch<SetStateAction<Story | undefined>>;
  setEditingChoiceId: Dispatch<SetStateAction<string | undefined>>;
  runMutation: RunMutation;
  getCurrentSession: () => ReaderProgressState;
  applyReloadedStory: (story: Story) => void;
}) {
  const saveCurrentInteraction = useCallback(
    async (patch: InteractionContentPatch) => {
      if (!current) return;
      await runMutation(
        () => api.updateInteraction(storyId, current.id, patch),
        (result) =>
          setStory((currentStory) =>
            currentStory ? applyInteractionResponse(currentStory, result) : currentStory,
          ),
      );
    },
    [current, runMutation, setStory, storyId],
  );

  const patchInteraction = useCallback(
    (interactionId: string, patch: InteractionContentPatch) => {
      if (!story) return;
      setStory({
        ...story,
        interactions: story.interactions.map((interaction) =>
          interaction.id === interactionId ? { ...interaction, ...patch } : interaction,
        ),
      });
    },
    [setStory, story],
  );

  const patchCurrentInteraction = useCallback(
    (patch: InteractionContentPatch) => {
      if (!current) return;
      patchInteraction(current.id, patch);
    },
    [current, patchInteraction],
  );

  const addOption = useCallback(async () => {
    if (!story) return;
    const creation = current
      ? ({ kind: 'child', sourceId: current.id } as const)
      : ({ kind: 'root' } as const);
    const position = await getStoryGraphClickCreationPosition(story, creation);
    await runMutation(
      () =>
        api.createInteraction(
          storyId,
          current
            ? {
                parentId: current.id,
                position,
              }
            : {
                position,
              },
        ),
      (result) => {
        const created = findSavedInteraction(result, story);
        setStory((currentStory) =>
          currentStory ? applyInteractionResponse(currentStory, result) : currentStory,
        );
        setEditingChoiceId(created?.id);
      },
      { retryable: false },
    );
  }, [current, runMutation, setEditingChoiceId, setStory, story, storyId]);

  const saveChoiceTitle = useCallback(
    async (interaction: Interaction, title: string) => {
      setEditingChoiceId(undefined);
      await runMutation(
        () => api.updateInteraction(storyId, interaction.id, { title }),
        (result) =>
          setStory((currentStory) =>
            currentStory ? applyInteractionResponse(currentStory, result) : currentStory,
          ),
      );
    },
    [runMutation, setEditingChoiceId, setStory, storyId],
  );

  const reloadAfterSimulationMutationFailure = useCallback(async () => {
    const currentSession = getCurrentSession();
    await runMutation(
      async () => {
        const bootstrap = await api.getStoryRuntimeBootstrap(storyId);
        const runtimeStory = await loadStoryRuntimeContext(storyId, bootstrap);
        return loadStoryRuntimeSlice(
          runtimeStory,
          currentSession.currentInteractionId,
          currentSession.journeyInteractionIds,
        );
      },
      applyReloadedStory,
      { retryable: false },
    );
  }, [applyReloadedStory, getCurrentSession, runMutation, storyId]);

  return {
    saveCurrentInteraction,
    patchInteraction,
    patchCurrentInteraction,
    addOption,
    saveChoiceTitle,
    reloadAfterSimulationMutationFailure,
  };
}

function applyInteractionResponse(story: Story, result: InteractionMutationResult | Story) {
  if ('interactions' in result) return ensureStoryInteractionPositions(result);
  return ensureStoryInteractionPositions(applyInteractionMutationResult(story, result));
}
