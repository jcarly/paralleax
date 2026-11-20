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

function blockStorageAccess() {
  vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
}

describe('onboarding progress', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('starts with the first action and advances only when that step is completed or skipped', () => {
    expect(currentOnboardingStep(initialOnboardingProgress)).toBe('write-scene');
    const completed = completeOnboardingStep(initialOnboardingProgress, 'write-scene');
    expect(currentOnboardingStep(completed)).toBe('create-branch');
    expect(currentOnboardingStep(skipOnboardingStep(completed, 'create-branch'))).toBe(
      'test-story',
    );
  });

  it('persists progress and resumes at the first unfinished action', () => {
    const key = onboardingStorageKey('author-1');
    const progress = completeOnboardingStep(
      { ...initialOnboardingProgress, status: 'active', storyId: 'story-1' },
      'write-scene',
    );
    writeOnboardingProgress(window.localStorage, key, progress);

    expect(readOnboardingProgress(window.localStorage, key)).toEqual(progress);
    expect(currentOnboardingStep(readOnboardingProgress(window.localStorage, key))).toBe(
      'create-branch',
    );
  });

  it('ignores malformed storage and tolerates storage failures', () => {
    const key = onboardingStorageKey(null);
    window.localStorage.setItem(key, '{broken');
    expect(readOnboardingProgress(window.localStorage, key)).toEqual(initialOnboardingProgress);

    blockStorageAccess();
    expect(readOnboardingProgress(window.localStorage, key)).toEqual(initialOnboardingProgress);
    expect(() => {
      writeOnboardingProgress(window.localStorage, key, initialOnboardingProgress);
    }).not.toThrow();
  });

  it('does not show the guide again after all steps are completed or passed', () => {
    let progress: OnboardingProgress = { ...initialOnboardingProgress, status: 'active' };
    for (const step of ['write-scene', 'create-branch', 'test-story'] as const) {
      progress = completeOnboardingStep(progress, step);
    }
    expect(progress.status).toBe('complete');
    expect(currentOnboardingStep(progress)).toBeNull();
  });
});

describe('stored onboarding progress', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('reads progress stored with the former Explore the graph step', () => {
    const key = onboardingStorageKey('author-1');
    window.localStorage.setItem(
      key,
      JSON.stringify({
        status: 'active',
        storyId: 'story-1',
        completedSteps: ['discover-interactions', 'write-scene'],
        skippedSteps: [],
      }),
    );

    const progress = readOnboardingProgress(window.localStorage, key);
    expect(progress.completedSteps).toEqual(['write-scene']);
    expect(currentOnboardingStep(progress)).toBe('create-branch');
  });
});
