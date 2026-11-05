import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { Link, MemoryRouter } from 'react-router-dom';
import { OnboardingGuide } from './OnboardingGuide';
import { OnboardingHelpButton } from './OnboardingHelpButton';
import { OnboardingProvider } from './OnboardingProvider';
import { useOnboarding } from './onboardingContext';

afterEach(cleanup);

function BeginGuide() {
  const { beginForStory, openHelp, progress, reportStepComplete } = useOnboarding();
  return (
    <>
      <button type="button" onClick={() => openHelp()}>
        Open library guide
      </button>
      <button type="button" onClick={() => beginForStory('story-1')}>
        Start guide
      </button>
      <button type="button" onClick={() => reportStepComplete('story-1', 'discover-interactions')}>
        Mark first step
      </button>
      <button type="button" onClick={() => reportStepComplete('story-1', 'write-scene')}>
        Mark scene saved
      </button>
      <button type="button" onClick={() => reportStepComplete('story-1', 'create-branch')}>
        Mark branch created
      </button>
      <button type="button" onClick={() => reportStepComplete('story-1', 'test-story')}>
        Mark test complete
      </button>
      <output data-testid="guide-status">{progress.status}</output>
      <Link to="/stories/story-1/play?mode=simulation">Go to Simulation</Link>
    </>
  );
}

function renderGuide(path = '/') {
  window.localStorage.removeItem('paralleax-onboarding:v1:author-1');
  return render(
    <MemoryRouter initialEntries={[path]}>
      <OnboardingProvider userId="author-1">
        <BeginGuide />
        <OnboardingHelpButton storyId="story-1" />
        <button data-onboarding-target="interaction" type="button">
          Interaction target
        </button>
        <aside data-onboarding-target="scene-inspector">Inspector target</aside>
        <button data-onboarding-target="branch-add" type="button">
          Branch target
        </button>
        <button data-onboarding-target="simulation-launch" type="button">
          Simulation target
        </button>
        <div data-onboarding-target="simulation-choices">Simulation choices target</div>
        <button data-onboarding-target="story-create" type="button">
          New story target
        </button>
        <OnboardingGuide />
      </OnboardingProvider>
    </MemoryRouter>,
  );
}

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

it('highlights the new-story action when opened from the library', async () => {
  const user = userEvent.setup();
  renderGuide();
  await user.click(screen.getByRole('button', { name: 'Open library guide' }));

  expect(screen.getByRole('region', { name: 'Create and test a story' })).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByText('New story target')).toHaveClass('onboarding-target-highlight'),
  );
});

it('highlights the interaction and inspector without trapping focus', async () => {
  const user = userEvent.setup();
  renderGuide('/stories/story-1/edit');
  await user.click(screen.getByRole('button', { name: 'Start guide' }));

  expect(screen.getByRole('heading', { name: 'Explore the graph' })).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByText('Interaction target')).toHaveClass('onboarding-target-highlight'),
  );
  const guideCard = screen.getByRole('region', { name: 'Explore the graph' });
  expect(guideCard.parentElement).toHaveClass('onboarding-guide-positioner');
  const guideLayer = guideCard.parentElement?.parentElement;
  expect(guideLayer).toHaveClass('onboarding-guide-layer');
  expect(guideLayer?.parentElement).toBe(document.body);

  await user.click(screen.getByRole('button', { name: 'Mark first step' }));
  expect(screen.getByRole('heading', { name: 'Write a scene' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Skip step' })).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.getByText('Inspector target')).toHaveClass('onboarding-target-highlight'),
  );
  expect(screen.getByText('Interaction target')).not.toHaveClass('onboarding-target-highlight');

  await user.click(screen.getByRole('button', { name: 'Close guide' }));
  expect(screen.queryByRole('heading', { name: 'Write a scene' })).not.toBeInTheDocument();
});

it('moves the highlight through branching and Simulation', async () => {
  const user = userEvent.setup();
  renderGuide('/stories/story-1/edit');
  await user.click(screen.getByRole('button', { name: 'Start guide' }));
  await user.click(screen.getByRole('button', { name: 'Mark first step' }));
  await user.click(screen.getByRole('button', { name: 'Mark scene saved' }));
  await waitFor(() =>
    expect(screen.getByText('Branch target')).toHaveClass('onboarding-target-highlight'),
  );
  await user.click(screen.getByRole('button', { name: 'Mark branch created' }));
  await waitFor(() =>
    expect(screen.getByText('Simulation target')).toHaveClass('onboarding-target-highlight'),
  );
  await user.click(screen.getByRole('link', { name: 'Go to Simulation' }));
  await waitFor(() =>
    expect(screen.getByText('Simulation choices target')).toHaveClass(
      'onboarding-target-highlight',
    ),
  );

  await user.click(screen.getByRole('button', { name: 'Close guide' }));
  expect(screen.queryByRole('heading', { name: 'Test your story' })).not.toBeInTheDocument();
});

it('can restart the guide from the help control', async () => {
  const user = userEvent.setup();
  renderGuide('/stories/story-1/edit');
  await user.click(screen.getByRole('button', { name: 'Start guide' }));
  await user.click(screen.getByRole('button', { name: 'Mark first step' }));
  await user.click(screen.getByRole('button', { name: 'Restart guide' }));

  expect(screen.getByRole('heading', { name: 'Explore the graph' })).toBeInTheDocument();
});

it('shows completion actions after testing and pauses when opening access settings', async () => {
  const user = userEvent.setup();
  renderGuide('/stories/story-1/edit');
  await user.click(screen.getByRole('button', { name: 'Start guide' }));
  await user.click(screen.getByRole('button', { name: 'Mark first step' }));
  await user.click(screen.getByRole('button', { name: 'Mark scene saved' }));
  await user.click(screen.getByRole('button', { name: 'Mark branch created' }));
  await user.click(screen.getByRole('link', { name: 'Go to Simulation' }));
  await user.click(screen.getByRole('button', { name: 'Mark test complete' }));

  expect(screen.getByRole('region', { name: 'Story ready to explore' })).toBeInTheDocument();
  const continueLink = screen.getByRole('link', { name: 'Continue creating' });
  const shareLink = screen.getByRole('link', { name: 'Share for testing' });
  expect(continueLink).toHaveAttribute('href', '/stories/story-1/edit');
  expect(shareLink).toHaveAttribute('href', '/stories/story-1/edit?settings=access');

  await user.click(shareLink);
  expect(screen.getByTestId('guide-status')).toHaveTextContent('paused');
  expect(screen.queryByRole('region', { name: 'Story ready to explore' })).not.toBeInTheDocument();
});
