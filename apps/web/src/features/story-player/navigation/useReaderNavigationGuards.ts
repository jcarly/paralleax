import { useCallback, useRef } from 'react';
import { useAutomaticReaderPathGuard } from './useAutomaticReaderPathGuard';

export function useReaderNavigationGuards() {
  const committedChoiceStep = useRef('');
  const navigationVersion = useRef(0);
  const automaticPath = useAutomaticReaderPathGuard();
  const resetAutomaticTransitions = automaticPath.resetAutomaticTransitions;

  const clearChoiceCommit = useCallback(() => {
    committedChoiceStep.current = '';
  }, []);
  const resetForNewStory = useCallback(() => {
    clearChoiceCommit();
    resetAutomaticTransitions();
  }, [clearChoiceCommit, resetAutomaticTransitions]);
  const commitChoiceStep = useCallback((stepKey: string) => {
    if (committedChoiceStep.current === stepKey) {
      return false;
    }
    committedChoiceStep.current = stepKey;
    navigationVersion.current += 1;
    return true;
  }, []);
  const getNavigationVersion = useCallback(() => navigationVersion.current, []);
  const incrementNavigationVersion = useCallback(() => {
    navigationVersion.current += 1;
  }, []);

  return {
    clearChoiceCommit,
    commitChoiceStep,
    getNavigationVersion,
    incrementNavigationVersion,
    resetAutomaticTransitions,
    resetForNewStory,
    clearAutomaticPath: automaticPath.clearAutomaticPath,
    canContinueAutomaticPath: automaticPath.canContinueAutomaticPath,
    isAutomaticStepBlocked: automaticPath.isAutomaticStepBlocked,
    continueAutomaticPath: automaticPath.continueAutomaticPath,
  };
}
