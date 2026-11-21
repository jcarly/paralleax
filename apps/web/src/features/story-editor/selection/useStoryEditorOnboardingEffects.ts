import { useEffect, useRef } from 'react';
import type { Story } from '@paralleax/shared';
import type { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import { storyHasAuthoredScene, storyHasBranchingChoice } from '../../onboarding/branchingChoice';
import { useOnboarding } from '../../onboarding/onboardingContext';

type StoryEditorOnboardingInput = {
  storyId: string;
  story?: Story;
  loadPhase: ReturnType<typeof useStoryEditorPersistence>['loadPhase'];
  storyRouteInaccessible: boolean;
};

export function useStoryEditorOnboardingEffects({
  storyId,
  story,
  loadPhase,
  storyRouteInaccessible,
}: StoryEditorOnboardingInput) {
  const { progress, reportStoryDeleted, reportStoryState, reportStepComplete } = useOnboarding();
  const lastOnboardingSnapshot = useRef<string | null>(null);
  useEffect(() => {
    if (storyRouteInaccessible) {
      reportStoryDeleted(storyId);
    }
  }, [reportStoryDeleted, storyId, storyRouteInaccessible]);
  useEffect(() => {
    if (loadPhase !== 'ready' || story?.id !== storyId) {
      return;
    }
    const snapshot = `${storyId}:${story.revision ?? 'loaded'}`;
    if (lastOnboardingSnapshot.current === snapshot) {
      return;
    }
    lastOnboardingSnapshot.current = snapshot;
    reportStoryState(storyId, storyHasAuthoredScene(story), storyHasBranchingChoice(story));
  }, [loadPhase, reportStoryState, story, storyId]);
  return { progress, reportStepComplete };
}
