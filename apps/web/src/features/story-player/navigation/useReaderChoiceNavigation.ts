import { useCallback, useLayoutEffect, useRef } from 'react';
import type { Interaction, ReaderProgressState, Story } from '@paralleax/shared';
import { getAvailableInteractions } from '@paralleax/shared';
import { transitionPlayerInteraction } from './transitionPlayerInteraction';

interface ReaderChoiceNavigationOptions {
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
}

export function useReaderChoiceNavigation(options: ReaderChoiceNavigationOptions) {
  const optionsRef = useRef(options);
  useLayoutEffect(() => {
    optionsRef.current = options;
  });

  return useCallback((interaction: Interaction, automaticTransition = false) => {
    const now = Date.now();
    const navigate = () =>
      executeReaderChoiceNavigation(optionsRef.current, interaction, automaticTransition, now);
    if (automaticTransition) {
      navigate();
    } else {
      transitionPlayerInteraction(navigate);
    }
  }, []);
}

function executeReaderChoiceNavigation(
  options: ReaderChoiceNavigationOptions,
  interaction: Interaction,
  automaticTransition: boolean,
  now: number,
): void {
  const { story, current } = options;
  if (!story) {
    return;
  }
  if (!automaticTransition) {
    options.resetAutomaticTransitions();
  }
  if (
    !(options.isSimulationMode && options.forceUnavailableOptions) &&
    !isChoiceAvailable(options, interaction, now)
  ) {
    options.setTimerNow(now);
    return;
  }

  const choiceStepKey = `${story.id}:${options.journeyLength}:${current?.id ?? ''}:${options.currentStepStartedAt ?? ''}`;
  if (!options.commitChoiceStep(choiceStepKey)) {
    return;
  }
  options.cancelCommentDraft();
  options.selectCommentThread(undefined);
  options.setTimerNow(now);
  options.saveProgress(options.advanceSession(story, interaction));
}

function isChoiceAvailable(
  options: ReaderChoiceNavigationOptions,
  interaction: Interaction,
  now: number,
): boolean {
  const { story, current } = options;
  if (!story) {
    return false;
  }
  const startedAt = options.currentStepStartedAt ? Date.parse(options.currentStepStartedAt) : now;
  return getAvailableInteractions(
    story,
    current?.id ?? null,
    options.visited,
    options.currentLocationId,
    current?.characterIds ?? [],
    options.statValues,
    options.currentDateTime,
    options.ownedItemDefinitionIds,
    options.itemStatValues,
    {
      randomSeed: options.randomSeed,
      step: options.journeyLength,
      elapsedTimeMs: Math.max(0, now - (Number.isNaN(startedAt) ? now : startedAt)),
    },
  ).some(({ id }) => id === interaction.id);
}
