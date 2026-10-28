import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeOnboardingStep,
  currentOnboardingStep,
  initialOnboardingProgress,
  onboardingStorageKey,
  readOnboardingProgress,
  skipOnboardingStep,
  writeOnboardingProgress,
  type OnboardingProgress,
} from './onboardingProgress';

describe('onboarding progress', () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('starts with the first action and advances only when that step is completed or skipped', () => {
    expect(currentOnboardingStep(initialOnboardingProgress)).toBe('discover-interactions');
    const completed = completeOnboardingStep(initialOnboardingProgress, 'discover-interactions');
    expect(currentOnboardingStep(completed)).toBe('write-scene');
    expect(currentOnboardingStep(skipOnboardingStep(completed, 'write-scene'))).toBe('create-branch');
  });

  it('persists progress and resumes at the first unfinished action', () => {
    const key = onboardingStorageKey('author-1');
    const progress = completeOnboardingStep(
      { ...initialOnboardingProgress, status: 'active', storyId: 'story-1' },
      'discover-interactions',
    );
    writeOnboardingProgress(window.localStorage, key, progress);

    expect(readOnboardingProgress(window.localStorage, key)).toEqual(progress);
    expect(currentOnboardingStep(readOnboardingProgress(window.localStorage, key))).toBe(
      'write-scene',
    );
  });

  it('ignores malformed storage and tolerates storage failures', () => {
    const key = onboardingStorageKey(null);
    window.localStorage.setItem(key, '{broken');
    expect(readOnboardingProgress(window.localStorage, key)).toEqual(initialOnboardingProgress);

    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readOnboardingProgress(window.localStorage, key)).toEqual(initialOnboardingProgress);
    expect(() =>
      writeOnboardingProgress(window.localStorage, key, initialOnboardingProgress),
    ).not.toThrow();
  });

  it('does not show the guide again after all steps are completed or passed', () => {
    let progress: OnboardingProgress = { ...initialOnboardingProgress, status: 'active' };
    for (const step of ['discover-interactions', 'write-scene', 'create-branch', 'test-story'] as const) {
      progress = completeOnboardingStep(progress, step);
    }
    expect(progress.status).toBe('complete');
    expect(currentOnboardingStep(progress)).toBeNull();
  });
});
