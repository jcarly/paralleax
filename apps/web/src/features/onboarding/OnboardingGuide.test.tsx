import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { OnboardingGuide } from './OnboardingGuide';
import { OnboardingHelpButton } from './OnboardingHelpButton';
import { OnboardingProvider } from './OnboardingProvider';
import { useOnboarding } from './onboardingContext';

afterEach(cleanup);

function BeginGuide() {
  const { beginForStory, reportStepComplete } = useOnboarding();
  return (
    <>
      <button type="button" onClick={() => beginForStory('story-1')}>
        Start guide
      </button>
      <button type="button" onClick={() => reportStepComplete('story-1', 'discover-interactions')}>
        Mark first step
      </button>
    </>
  );
}

function renderGuide(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <OnboardingProvider userId="author-1">
        <BeginGuide />
        <OnboardingHelpButton storyId="story-1" />
        <OnboardingGuide />
      </OnboardingProvider>
    </MemoryRouter>,
  );
}

describe('OnboardingGuide', () => {
  it('offers a link to the new story without interrupting the library', async () => {
    const user = userEvent.setup();
    renderGuide();
    await user.click(screen.getByRole('button', { name: 'Start guide' }));

    expect(screen.getByRole('region', { name: 'Create and test a story' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open story' })).toHaveAttribute(
      'href',
      '/stories/story-1/edit',
    );
  });

  it('shows one action at a time and closes without trapping focus', async () => {
    const user = userEvent.setup();
    renderGuide('/stories/story-1/edit');
    await user.click(screen.getByRole('button', { name: 'Start guide' }));

    expect(screen.getByRole('heading', { name: 'Explore the graph' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mark first step' }));
    expect(screen.getByRole('heading', { name: 'Write a scene' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Skip step' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close guide' }));
    expect(screen.queryByRole('heading', { name: 'Write a scene' })).not.toBeInTheDocument();
  });

  it('can restart the guide from the help control', async () => {
    const user = userEvent.setup();
    renderGuide('/stories/story-1/edit');
    await user.click(screen.getByRole('button', { name: 'Start guide' }));
    await user.click(screen.getByRole('button', { name: 'Mark first step' }));
    await user.click(screen.getByRole('button', { name: 'Restart guide' }));

    expect(screen.getByRole('heading', { name: 'Explore the graph' })).toBeInTheDocument();
  });
});
