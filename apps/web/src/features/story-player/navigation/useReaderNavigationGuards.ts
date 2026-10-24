import { useCallback, useRef } from 'react';

interface AutomaticTransitionPath {
  storyId: string;
  journeyLength: number;
  interactionId: string;
  interactionIds: Set<string>;
}

export function useReaderNavigationGuards() {
  const committedChoiceStep = useRef('');
  const navigationVersion = useRef(0);
  const automaticPath = useRef<AutomaticTransitionPath | undefined>(undefined);
  const blockedAutomaticStep = useRef('');

  const clearChoiceCommit = useCallback(() => {
    committedChoiceStep.current = '';
  }, []);

  const resetAutomaticTransitions = useCallback(() => {
    automaticPath.current = undefined;
    blockedAutomaticStep.current = '';
  }, []);

  const resetForNewStory = useCallback(() => {
    clearChoiceCommit();
    resetAutomaticTransitions();
  }, [clearChoiceCommit, resetAutomaticTransitions]);

  const commitChoiceStep = useCallback((stepKey: string) => {
    if (committedChoiceStep.current === stepKey) return false;
    committedChoiceStep.current = stepKey;
    navigationVersion.current += 1;
    return true;
  }, []);

  const getNavigationVersion = useCallback(() => navigationVersion.current, []);

  const incrementNavigationVersion = useCallback(() => {
    navigationVersion.current += 1;
  }, []);

  const clearAutomaticPath = useCallback(() => {
    automaticPath.current = undefined;
  }, []);

  const isAutomaticStepBlocked = useCallback(
    (stepKey: string) => blockedAutomaticStep.current === stepKey,
    [],
  );

  const continueAutomaticPath = useCallback(
    ({
      storyId,
      journeyLength,
      interactionId,
      destinationId,
      stepKey,
    }: {
      storyId: string;
      journeyLength: number;
      interactionId: string;
      destinationId: string;
      stepKey: string;
    }) => {
      const previousPath = automaticPath.current;
      const interactionIds =
        previousPath?.storyId === storyId &&
        previousPath.journeyLength === journeyLength &&
        previousPath.interactionId === interactionId
          ? new Set(previousPath.interactionIds)
          : new Set([interactionId]);

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
    },
    [],
  );

  return {
    clearChoiceCommit,
    commitChoiceStep,
    getNavigationVersion,
    incrementNavigationVersion,
    resetAutomaticTransitions,
    resetForNewStory,
    clearAutomaticPath,
    isAutomaticStepBlocked,
    continueAutomaticPath,
  };
}
