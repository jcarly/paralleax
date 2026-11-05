import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, setupStoryPlayerTestSuite, story, StoryPlayer } from '../test/storyPlayerTestHarness';
import { TestDataRouter } from '../test/TestDataRouter';
import { OnboardingGuide } from '../features/onboarding/OnboardingGuide';
import { OnboardingProvider } from '../features/onboarding/OnboardingProvider';
import { onboardingStorageKey } from '../features/onboarding/onboardingProgress';

vi.mock('../api', async () => {
  const { createStoryApiMock } = await import('../test/mockStoryApi');
  return { api: createStoryApiMock() };
});

afterEach(cleanup);

function prepareTestStep() {
  window.localStorage.setItem(
    onboardingStorageKey('owner-1'),
    JSON.stringify({
      status: 'active',
      storyId: 'story-1',
      completedSteps: ['discover-interactions', 'write-scene', 'create-branch'],
      skippedSteps: [],
    }),
  );
  vi.mocked(api.getStory).mockResolvedValue(structuredClone(story));
  vi.mocked(api.getReaderProgress).mockResolvedValue(null);
  vi.mocked(api.listReaderSaves).mockResolvedValue([]);
  vi.mocked(api.saveReaderProgress).mockResolvedValue({
    state: {
      version: 1,
      journeyInteractionIds: [],
      currentInteractionId: null,
      visitedInteractionIds: [],
      currentDateTime: '2000-01-03T08:00',
      currentLocationId: null,
      statValues: {},
      ownedItemIds: [],
    },
    updatedAt: '2026-07-27T09:00:00.000Z',
  });
}

function renderWithGuide(initialEntry: string) {
  return render(
    <TestDataRouter initialEntry={initialEntry}>
      <OnboardingProvider userId="owner-1">
        <Routes>
          <Route path="/stories/:storyId/play" element={<StoryPlayer currentUserId="owner-1" />} />
        </Routes>
        <OnboardingGuide />
      </OnboardingProvider>
    </TestDataRouter>,
  );
}

describe('StoryPlayer onboarding', () => {
  setupStoryPlayerTestSuite();

  it('does not complete the guide when Simulation starts at the selected Interaction', async () => {
    const user = userEvent.setup();
    prepareTestStep();
    renderWithGuide('/stories/story-1/play?mode=simulation&startInteractionId=start');

    await screen.findByDisplayValue('Start');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    await screen.findByDisplayValue('Next');
    expect(screen.getByRole('heading', { name: 'Test your story' })).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Story ready to explore' }),
    ).not.toBeInTheDocument();
  });

  it('completes the guide after a path is played from the start screen', async () => {
    const user = userEvent.setup();
    prepareTestStep();
    renderWithGuide('/stories/story-1/play?mode=simulation');

    await user.click(await screen.findByRole('button', { name: 'Start' }));
    await screen.findByDisplayValue('Start');
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(
      await screen.findByRole('region', { name: 'Story ready to explore' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Share for testing' })).toHaveAttribute(
      'href',
      '/stories/story-1/edit?settings=access',
    );
  });
});
