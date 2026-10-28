export const onboardingStepIds = [
  'discover-interactions',
  'write-scene',
  'create-branch',
  'test-story',
] as const;

export type OnboardingStepId = (typeof onboardingStepIds)[number];
export type OnboardingStatus = 'idle' | 'active' | 'paused' | 'complete';

export interface OnboardingProgress {
  status: OnboardingStatus;
  storyId: string | null;
  completedSteps: OnboardingStepId[];
  skippedSteps: OnboardingStepId[];
}

export const initialOnboardingProgress: OnboardingProgress = {
  status: 'idle',
  storyId: null,
  completedSteps: [],
  skippedSteps: [],
};

export function readOnboardingProgress(storage: Storage, key: string): OnboardingProgress {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? 'null');
    if (!value || typeof value !== 'object') return initialOnboardingProgress;
    const candidate = value as Partial<OnboardingProgress>;
    const completedSteps = validStepIds(candidate.completedSteps);
    const skippedSteps = validStepIds(candidate.skippedSteps);
    const status = validStatus(candidate.status);
    const storyId = typeof candidate.storyId === 'string' ? candidate.storyId : null;
    return normalizeProgress({ status, storyId, completedSteps, skippedSteps });
  } catch {
    return initialOnboardingProgress;
  }
}

export function writeOnboardingProgress(
  storage: Storage,
  key: string,
  progress: OnboardingProgress,
): void {
  try {
    storage.setItem(key, JSON.stringify(progress));
  } catch {
    // Storage can be disabled or full; onboarding must remain optional.
  }
}

export function currentOnboardingStep(progress: OnboardingProgress): OnboardingStepId | null {
  return (
    onboardingStepIds.find(
      (step) => !progress.completedSteps.includes(step) && !progress.skippedSteps.includes(step),
    ) ?? null
  );
}

export function completeOnboardingStep(
  progress: OnboardingProgress,
  step: OnboardingStepId,
): OnboardingProgress {
  if (progress.completedSteps.includes(step) || progress.skippedSteps.includes(step)) {
    return progress;
  }
  return normalizeProgress({
    ...progress,
    completedSteps: [...progress.completedSteps, step],
  });
}

export function skipOnboardingStep(
  progress: OnboardingProgress,
  step: OnboardingStepId,
): OnboardingProgress {
  if (progress.completedSteps.includes(step) || progress.skippedSteps.includes(step)) {
    return progress;
  }
  return normalizeProgress({
    ...progress,
    skippedSteps: [...progress.skippedSteps, step],
  });
}

export function onboardingStorageKey(userId: string | null): string {
  return `paralleax-onboarding:v1:${userId ?? 'anonymous'}`;
}

function validStepIds(value: unknown): OnboardingStepId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isOnboardingStepId))];
}

function isOnboardingStepId(value: unknown): value is OnboardingStepId {
  return typeof value === 'string' && onboardingStepIds.some((step) => step === value);
}

function validStatus(value: unknown): OnboardingStatus {
  return value === 'active' || value === 'paused' || value === 'complete' ? value : 'idle';
}

function normalizeProgress(progress: OnboardingProgress): OnboardingProgress {
  const completedSteps = progress.completedSteps.filter(
    (step) => !progress.skippedSteps.includes(step),
  );
  const status =
    currentOnboardingStep({ ...progress, completedSteps }) === null
      ? 'complete'
      : progress.status === 'complete'
        ? 'paused'
        : progress.status;
  return { ...progress, status, completedSteps };
}
