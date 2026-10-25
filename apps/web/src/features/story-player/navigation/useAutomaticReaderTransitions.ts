import { useEffect } from 'react';
import type { Interaction, Story } from '@paralleax/shared';
import { hasVisibleRichTextContent } from '../../../components/richTextProjection';

type ConditionalTextState = Parameters<typeof hasVisibleRichTextContent>[1];
type AutomaticPath = {
  storyId: string;
  journeyLength: number;
  interactionId: string;
  destinationId: string;
  stepKey: string;
};

export function useAutomaticReaderTransitions({
  isSimulationMode,
  loadedKey,
  loadKey,
  runtimeSliceReady,
  journeyLength,
  playableCharacterCount,
  playedCharacterId,
  choices,
  choose,
  current,
  currentStepStartedAt,
  story,
  conditionalTextState,
  conditionalTextBlockState,
  statValues,
  itemStatValues,
  isAutomaticStepBlocked,
  clearAutomaticPath,
  continueAutomaticPath,
}: {
  isSimulationMode: boolean;
  loadedKey: string;
  loadKey: string;
  runtimeSliceReady: boolean;
  journeyLength: number;
  playableCharacterCount: number;
  playedCharacterId: string | undefined;
  choices: Interaction[];
  choose: (interaction: Interaction, automaticTransition?: boolean) => void;
  current: Interaction | undefined;
  currentStepStartedAt: string | undefined;
  story: Story | undefined;
  conditionalTextState: ConditionalTextState | undefined;
  conditionalTextBlockState: ConditionalTextState | undefined;
  statValues: Parameters<typeof hasVisibleRichTextContent>[3];
  itemStatValues: Parameters<typeof hasVisibleRichTextContent>[4];
  isAutomaticStepBlocked: (stepKey: string) => boolean;
  clearAutomaticPath: () => void;
  continueAutomaticPath: (path: AutomaticPath) => boolean;
}) {
  useEffect(() => {
    if (
      isSimulationMode ||
      loadedKey !== loadKey ||
      !runtimeSliceReady ||
      journeyLength > 0 ||
      (playableCharacterCount > 0 && !playedCharacterId) ||
      choices.length !== 1
    ) {
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) choose(choices[0]);
    });
    return () => {
      cancelled = true;
    };
  }, [
    choices,
    choose,
    isSimulationMode,
    journeyLength,
    loadKey,
    loadedKey,
    playedCharacterId,
    playableCharacterCount,
    runtimeSliceReady,
  ]);

  useEffect(() => {
    if (
      isSimulationMode ||
      loadedKey !== loadKey ||
      !runtimeSliceReady ||
      !current ||
      journeyLength === 0 ||
      (playableCharacterCount > 0 && !playedCharacterId)
    ) {
      return;
    }

    const stepKey = [
      story?.id ?? '',
      story?.revision ?? 0,
      journeyLength,
      current.id,
      currentStepStartedAt ?? '',
      choices.map(({ id }) => id).join(','),
    ].join(':');
    if (isAutomaticStepBlocked(stepKey)) return;

    if (
      !story ||
      hasVisibleRichTextContent(
        current.body,
        conditionalTextState,
        conditionalTextBlockState,
        statValues,
        itemStatValues,
      ) ||
      choices.length !== 1
    ) {
      clearAutomaticPath();
      return;
    }

    const destination = choices[0];
    if (
      !continueAutomaticPath({
        storyId: story.id,
        journeyLength,
        interactionId: current.id,
        destinationId: destination.id,
        stepKey,
      })
    ) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) choose(destination, true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    choices,
    choose,
    clearAutomaticPath,
    conditionalTextBlockState,
    conditionalTextState,
    continueAutomaticPath,
    current,
    currentStepStartedAt,
    isAutomaticStepBlocked,
    isSimulationMode,
    journeyLength,
    itemStatValues,
    loadKey,
    loadedKey,
    playedCharacterId,
    playableCharacterCount,
    runtimeSliceReady,
    statValues,
    story,
  ]);
}
