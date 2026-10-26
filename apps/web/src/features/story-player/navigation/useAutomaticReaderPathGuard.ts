import { useCallback, useRef } from 'react';

interface AutomaticTransitionPath {
  storyId: string;
  journeyLength: number;
  interactionId: string;
  interactionIds: Set<string>;
}

export interface AutomaticTransitionCandidate {
  storyId: string;
  journeyLength: number;
  interactionId: string;
  destinationId: string;
  stepKey: string;
}

export function useAutomaticReaderPathGuard() {
  const automaticPath = useRef<AutomaticTransitionPath | undefined>(undefined);
  const blockedAutomaticStep = useRef('');

  const clearAutomaticPath = useCallback(() => {
    automaticPath.current = undefined;
  }, []);
  const resetAutomaticTransitions = useCallback(() => {
    automaticPath.current = undefined;
    blockedAutomaticStep.current = '';
  }, []);
  const canContinueAutomaticPath = useCallback((candidate: AutomaticTransitionCandidate) => {
    return !getAutomaticPathInteractionIds(automaticPath.current, candidate).has(
      candidate.destinationId,
    );
  }, []);
  const isAutomaticStepBlocked = useCallback(
    (stepKey: string) => blockedAutomaticStep.current === stepKey,
    [],
  );
  const continueAutomaticPath = useCallback((candidate: AutomaticTransitionCandidate) => {
    const { storyId, journeyLength, destinationId, stepKey } = candidate;
    const interactionIds = getAutomaticPathInteractionIds(automaticPath.current, candidate);
    if (interactionIds.has(destinationId)) {
      blockedAutomaticStep.current = stepKey;
      automaticPath.current = undefined;
      return false;
    }
    interactionIds.add(destinationId);
    automaticPath.current = {
      storyId,
      journeyLength: journeyLength + 1,
      interactionId: destinationId,
      interactionIds,
    };
    return true;
  }, []);

  return {
    clearAutomaticPath,
    resetAutomaticTransitions,
    canContinueAutomaticPath,
    isAutomaticStepBlocked,
    continueAutomaticPath,
  };
}

function getAutomaticPathInteractionIds(
  previousPath: AutomaticTransitionPath | undefined,
  candidate: AutomaticTransitionCandidate,
): Set<string> {
  if (
    previousPath?.storyId === candidate.storyId &&
    previousPath.journeyLength === candidate.journeyLength &&
    previousPath.interactionId === candidate.interactionId
  ) {
    return new Set(previousPath.interactionIds);
  }
  return new Set([candidate.interactionId]);
}
