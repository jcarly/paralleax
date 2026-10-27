import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Interaction, Story } from '@paralleax/shared';
import type { AutomaticTransitionCandidate } from './useAutomaticReaderPathGuard';
import {
  getAutomaticReaderPassThroughDestination,
  getAutomaticReaderStepKey,
  shouldHideAutomaticReaderPassThrough,
} from './automaticReaderPassThrough';

type ConditionalTextState = Parameters<
  typeof getAutomaticReaderPassThroughDestination
>[0]['conditionalTextState'];
export interface AutomaticReaderTransitionOptions {
  isSimulationMode: boolean;
  loadedKey: string;
  loadKey: string;
  runtimeSliceReady: boolean;
  hasRuntimeSliceError: boolean;
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
  statValues: Parameters<typeof getAutomaticReaderPassThroughDestination>[0]['statValues'];
  itemStatValues: Parameters<typeof getAutomaticReaderPassThroughDestination>[0]['itemStatValues'];
  isAutomaticStepBlocked: (stepKey: string) => boolean;
  canContinueAutomaticPath: (path: AutomaticTransitionCandidate) => boolean;
  clearAutomaticPath: () => void;
  continueAutomaticPath: (path: AutomaticTransitionCandidate) => boolean;
}

export function useAutomaticReaderTransitions(options: AutomaticReaderTransitionOptions): boolean {
  const optionsRef = useRef(options);

  useLayoutEffect(() => {
    optionsRef.current = options;
  });
  useEffect(() => scheduleAutomaticOpening(optionsRef.current));
  useLayoutEffect(() => advanceEmptyInteraction(optionsRef.current));
  return shouldHideAutomaticReaderPassThrough(options);
}

function scheduleAutomaticOpening({
  isSimulationMode,
  loadedKey,
  loadKey,
  runtimeSliceReady,
  journeyLength,
  playableCharacterCount,
  playedCharacterId,
  choices,
  choose,
}: AutomaticReaderTransitionOptions): (() => void) | undefined {
  if (
    isSimulationMode ||
    loadedKey !== loadKey ||
    !runtimeSliceReady ||
    journeyLength > 0 ||
    (playableCharacterCount > 0 && !playedCharacterId) ||
    choices.length !== 1
  ) {
    return undefined;
  }

  let cancelled = false;
  queueMicrotask(() => {
    if (!cancelled) {
      choose(choices[0]);
    }
  });
  return () => {
    cancelled = true;
  };
}

function advanceEmptyInteraction(options: AutomaticReaderTransitionOptions): void {
  if (!canAttemptAutomaticPassThrough(options)) {
    return;
  }
  const candidate = getAutomaticPassThroughCandidate(options);
  if (!candidate) {
    return;
  }
  if (!options.continueAutomaticPath(candidate)) {
    return;
  }
  options.choose(candidate.destination, true);
}

function canAttemptAutomaticPassThrough({
  isSimulationMode,
  loadedKey,
  loadKey,
  runtimeSliceReady,
  journeyLength,
  playableCharacterCount,
  playedCharacterId,
  current,
}: AutomaticReaderTransitionOptions): boolean {
  return Boolean(
    !isSimulationMode &&
    loadedKey === loadKey &&
    runtimeSliceReady &&
    current &&
    journeyLength > 0 &&
    !(playableCharacterCount > 0 && !playedCharacterId),
  );
}

function getAutomaticPassThroughCandidate(
  options: AutomaticReaderTransitionOptions,
): (AutomaticTransitionCandidate & { destination: Interaction }) | undefined {
  const { story, current, choices, journeyLength, currentStepStartedAt } = options;
  const stepKey = getAutomaticReaderStepKey({
    story,
    journeyLength,
    current,
    currentStepStartedAt,
    choices,
  });
  if (options.isAutomaticStepBlocked(stepKey)) {
    return undefined;
  }

  const destination = getAutomaticReaderPassThroughDestination({
    story,
    current,
    choices,
    conditionalTextState: options.conditionalTextState,
    conditionalTextBlockState: options.conditionalTextBlockState,
    statValues: options.statValues,
    itemStatValues: options.itemStatValues,
  });
  if (!story || !current || !destination) {
    options.clearAutomaticPath();
    return undefined;
  }
  return {
    storyId: story.id,
    journeyLength,
    interactionId: current.id,
    destinationId: destination.id,
    stepKey,
    destination,
  };
}
