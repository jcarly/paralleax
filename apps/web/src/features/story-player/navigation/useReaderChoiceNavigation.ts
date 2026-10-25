import { useCallback } from 'react';
import type { Interaction, ReaderProgressState, Story } from '@paralleax/shared';
import { getAvailableInteractions } from '@paralleax/shared';

export function useReaderChoiceNavigation({
  story,
  current,
  visited,
  currentLocationId,
  currentDateTime,
  statValues,
  ownedItemDefinitionIds,
  itemStatValues,
  randomSeed,
  journeyLength,
  currentStepStartedAt,
  isSimulationMode,
  forceUnavailableOptions,
  resetAutomaticTransitions,
  commitChoiceStep,
  cancelCommentDraft,
  selectCommentThread,
  setTimerNow,
  advanceSession,
  saveProgress,
}: {
  story: Story | undefined;
  current: Interaction | undefined;
  visited: string[];
  currentLocationId: string | null;
  currentDateTime: string;
  statValues: ReaderProgressState['statValues'];
  ownedItemDefinitionIds: string[];
  itemStatValues: NonNullable<ReaderProgressState['itemStatValues']>;
  randomSeed: string;
  journeyLength: number;
  currentStepStartedAt: string | undefined;
  isSimulationMode: boolean;
  forceUnavailableOptions: boolean;
  resetAutomaticTransitions: () => void;
  commitChoiceStep: (stepKey: string) => boolean;
  cancelCommentDraft: () => void;
  selectCommentThread: (threadId: string | undefined) => void;
  setTimerNow: (now: number) => void;
  advanceSession: (story: Story, interaction: Interaction) => ReaderProgressState;
  saveProgress: (session: ReaderProgressState) => void;
}) {
  return useCallback(
    (interaction: Interaction, automaticTransition = false) => {
      if (!story) return;
      if (!automaticTransition) {
        resetAutomaticTransitions();
      }
      const now = Date.now();
      if (!(isSimulationMode && forceUnavailableOptions)) {
        const startedAt = currentStepStartedAt ? Date.parse(currentStepStartedAt) : now;
        const stillAvailable = getAvailableInteractions(
          story,
          current?.id ?? null,
          visited,
          currentLocationId,
          current?.characterIds ?? [],
          statValues,
          currentDateTime,
          ownedItemDefinitionIds,
          itemStatValues,
          {
            randomSeed,
            step: journeyLength,
            elapsedTimeMs: Math.max(0, now - (Number.isNaN(startedAt) ? now : startedAt)),
          },
        ).some(({ id }) => id === interaction.id);
        if (!stillAvailable) {
          setTimerNow(now);
          return;
        }
      }
      const choiceStepKey = `${story.id}:${journeyLength}:${current?.id ?? ''}:${currentStepStartedAt ?? ''}`;
      if (!commitChoiceStep(choiceStepKey)) return;
      cancelCommentDraft();
      selectCommentThread(undefined);
      setTimerNow(now);
      const nextSession = advanceSession(story, interaction);
      saveProgress(nextSession);
    },
    [
      advanceSession,
      cancelCommentDraft,
      selectCommentThread,
      current,
      currentDateTime,
      currentLocationId,
      currentStepStartedAt,
      resetAutomaticTransitions,
      commitChoiceStep,
      forceUnavailableOptions,
      isSimulationMode,
      itemStatValues,
      journeyLength,
      ownedItemDefinitionIds,
      randomSeed,
      saveProgress,
      setTimerNow,
      statValues,
      story,
      visited,
    ],
  );
}
