import { createContext, useContext } from 'react';
import {
  initialOnboardingProgress,
  type OnboardingProgress,
  type OnboardingStepId,
} from './onboardingProgress';

export interface OnboardingContextValue {
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

export const OnboardingContext = createContext(defaultValue);

export function useOnboarding(): OnboardingContextValue {
  return useContext(OnboardingContext);
}
