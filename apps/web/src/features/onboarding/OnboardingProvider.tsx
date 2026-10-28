import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
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

interface OnboardingContextValue {
  progress: OnboardingProgress;
  beginForStory: (storyId: string) => void;
  openHelp: (storyId?: string) => void;
  pause: () => void;
  restart: (storyId?: string) => void;
  skipCurrentStep: () => void;
  reportStepComplete: (storyId: string, step: OnboardingStepId) => void;
  reportStoryState: (storyId: string, hasScene: boolean, hasBranch: boolean) => void;
  reportStoryDeleted: (storyId: string) => void;
}

const defaultValue: OnboardingContextValue = {
  progress: initialOnboardingProgress,
  beginForStory: () => undefined,
  openHelp: () => undefined,
  pause: () => undefined,
  restart: () => undefined,
  skipCurrentStep: () => undefined,
  reportStepComplete: () => undefined,
  reportStoryState: () => undefined,
  reportStoryDeleted: () => undefined,
};

const OnboardingContext = createContext(defaultValue);

export function OnboardingProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId: string | null | undefined;
}) {
  const storageKey = onboardingStorageKey(userId ?? null);
  const [progress, setProgress] = useState(() =>
    readOnboardingProgress(window.localStorage, storageKey),
  );

  useEffect(
    () => writeOnboardingProgress(window.localStorage, storageKey, progress),
    [progress, storageKey],
  );

  const update = useCallback((transform: (current: OnboardingProgress) => OnboardingProgress) => {
    setProgress((current) => transform(current));
  }, []);

  const beginForStory = useCallback(
    (storyId: string) => {
      update(() => ({ ...initialOnboardingProgress, status: 'active', storyId }));
    },
    [update],
  );

  const restart = useCallback(
    (storyId?: string) => {
      update((current) => ({
        ...initialOnboardingProgress,
        status: 'active',
        storyId: storyId ?? current.storyId,
      }));
    },
    [update],
  );

  const openHelp = useCallback(
    (storyId?: string) => {
      update((current) => {
        if (!storyId || storyId === current.storyId) {
          if (current.status === 'active') return current;
          if (current.status === 'paused') return { ...current, status: 'active' };
        }
        return {
          ...initialOnboardingProgress,
          status: 'active',
          storyId: storyId ?? current.storyId,
        };
      });
    },
    [update],
  );

  const pause = useCallback(() => {
    update((current) =>
      current.status === 'active' ? { ...current, status: 'paused' } : current,
    );
  }, [update]);

  const skipCurrentStep = useCallback(() => {
    update((current) => {
      const step = currentOnboardingStep(current);
      return current.status === 'active' && step ? skipOnboardingStep(current, step) : current;
    });
  }, [update]);

  const reportStepComplete = useCallback(
    (storyId: string, step: OnboardingStepId) => {
      update((current) =>
        current.storyId === storyId && current.status !== 'idle'
          ? completeOnboardingStep(current, step)
          : current,
      );
    },
    [update],
  );

  const reportStoryState = useCallback(
    (storyId: string, hasScene: boolean, hasBranch: boolean) => {
      update((current) => {
        if (current.storyId !== storyId || current.status === 'idle') return current;
        let next = current;
        if (hasScene) next = completeOnboardingStep(next, 'write-scene');
        if (hasBranch) next = completeOnboardingStep(next, 'create-branch');
        return next;
      });
    },
    [update],
  );

  const reportStoryDeleted = useCallback(
    (storyId: string) => {
      update((current) =>
        current.storyId === storyId
          ? { ...current, status: 'paused', storyId: null }
          : current,
      );
    },
    [update],
  );

  const value = useMemo(
    () => ({
      progress,
      beginForStory,
      openHelp,
      pause,
      restart,
      skipCurrentStep,
      reportStepComplete,
      reportStoryState,
      reportStoryDeleted,
    }),
    [
      beginForStory,
      openHelp,
      pause,
      progress,
      reportStepComplete,
      reportStoryDeleted,
      reportStoryState,
      restart,
      skipCurrentStep,
    ],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  return useContext(OnboardingContext);
}
