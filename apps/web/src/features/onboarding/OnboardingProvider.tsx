import { useEffect, useMemo, useReducer } from 'react';
import type { Dispatch, ReactNode } from 'react';
import { OnboardingContext } from './onboardingContext';
import type { OnboardingContextValue } from './onboardingContext';
import {
  completeOnboardingStep,
  currentOnboardingStep,
  initialOnboardingProgress,
  onboardingStorageKey,
  readOnboardingProgress,
  skipOnboardingStep,
  writeOnboardingProgress,
  type OnboardingProgress,
  type OnboardingStepId,
} from './onboardingProgress';

type OnboardingAction =
  | { type: 'begin'; storyId: string }
  | { type: 'open-help'; storyId?: string }
  | { type: 'pause' }
  | { type: 'restart'; storyId?: string }
  | { type: 'skip' }
  | { type: 'complete'; storyId: string; step: OnboardingStepId }
  | { type: 'story-state'; storyId: string; hasScene: boolean; hasBranch: boolean }
  | { type: 'story-deleted'; storyId: string };

type LifecycleAction = Extract<
  OnboardingAction,
  { type: 'begin' | 'open-help' | 'pause' | 'restart' }
>;
type StepAction = Extract<OnboardingAction, { type: 'skip' | 'complete' }>;
type StoryAction = Extract<OnboardingAction, { type: 'story-state' | 'story-deleted' }>;

function openGuide(progress: OnboardingProgress, storyId?: string): OnboardingProgress {
  if (!storyId || storyId === progress.storyId) {
    if (progress.status === 'active') {
      return progress;
    }
    if (progress.status === 'paused') {
      return { ...progress, status: 'active' };
    }
  }
  return { ...initialOnboardingProgress, status: 'active', storyId: storyId ?? progress.storyId };
}

function applyStoryState(
  progress: OnboardingProgress,
  storyId: string,
  hasScene: boolean,
  hasBranch: boolean,
): OnboardingProgress {
  if (progress.storyId !== storyId || progress.status === 'idle') {
    return progress;
  }
  let next = progress;
  if (hasScene) {
    next = completeOnboardingStep(next, 'write-scene');
  }
  if (hasBranch) {
    next = completeOnboardingStep(next, 'create-branch');
  }
  return next;
}

function reduceLifecycleAction(
  progress: OnboardingProgress,
  action: LifecycleAction,
): OnboardingProgress {
  switch (action.type) {
    case 'begin':
      return { ...initialOnboardingProgress, status: 'active', storyId: action.storyId };
    case 'open-help':
      return openGuide(progress, action.storyId);
    case 'pause':
      return progress.status === 'active' ? { ...progress, status: 'paused' } : progress;
    case 'restart':
      return {
        ...initialOnboardingProgress,
        status: 'active',
        storyId: action.storyId ?? progress.storyId,
      };
  }
}

function reduceStepAction(
  progress: OnboardingProgress,
  action: StepAction,
): OnboardingProgress {
  switch (action.type) {
    case 'skip': {
      const step = currentOnboardingStep(progress);
      return progress.status === 'active' && step ? skipOnboardingStep(progress, step) : progress;
    }
    case 'complete':
      return progress.storyId === action.storyId && progress.status !== 'idle'
        ? completeOnboardingStep(progress, action.step)
        : progress;
  }
}

function reduceStoryAction(
  progress: OnboardingProgress,
  action: StoryAction,
): OnboardingProgress {
  switch (action.type) {
    case 'story-state':
      return applyStoryState(progress, action.storyId, action.hasScene, action.hasBranch);
    case 'story-deleted':
      return progress.storyId === action.storyId
        ? { ...progress, status: 'paused', storyId: null }
        : progress;
  }
}

function onboardingReducer(
  progress: OnboardingProgress,
  action: OnboardingAction,
): OnboardingProgress {
  switch (action.type) {
    case 'begin':
    case 'open-help':
    case 'pause':
    case 'restart':
      return reduceLifecycleAction(progress, action);
    case 'skip':
    case 'complete':
      return reduceStepAction(progress, action);
    case 'story-state':
    case 'story-deleted':
      return reduceStoryAction(progress, action);
  }
}

function createActions(
  dispatch: Dispatch<OnboardingAction>,
): Omit<OnboardingContextValue, 'progress'> {
  return {
    beginForStory: (storyId) => dispatch({ type: 'begin', storyId }),
    openHelp: (storyId) => dispatch({ type: 'open-help', storyId }),
    pause: () => dispatch({ type: 'pause' }),
    restart: (storyId) => dispatch({ type: 'restart', storyId }),
    skipCurrentStep: () => dispatch({ type: 'skip' }),
    reportStepComplete: (storyId, step) => dispatch({ type: 'complete', storyId, step }),
    reportStoryState: (storyId, hasScene, hasBranch) =>
      dispatch({ type: 'story-state', storyId, hasScene, hasBranch }),
    reportStoryDeleted: (storyId) => dispatch({ type: 'story-deleted', storyId }),
  };
}

export function OnboardingProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string | null | undefined;
}) {
  const storageKey = onboardingStorageKey(userId ?? null);
  const [progress, dispatch] = useReducer(
    onboardingReducer,
    storageKey,
    (key) => readOnboardingProgress(window.localStorage, key),
  );
  const actions = useMemo(() => createActions(dispatch), [dispatch]);
  const value = useMemo(() => ({ ...actions, progress }), [actions, progress]);

  useEffect(
    () => writeOnboardingProgress(window.localStorage, storageKey, progress),
    [progress, storageKey],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}
