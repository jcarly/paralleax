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
  const actions = [
    { label: 'Open library guide', onClick: bindAction(openHelp) },
    { label: 'Start guide', onClick: bindAction(beginForStory, 'story-1') },
    {
      label: 'Mark scene saved',
      onClick: bindAction(reportStepComplete, 'story-1', 'write-scene'),
    },
    {
      label: 'Mark branch created',
      onClick: bindAction(reportStepComplete, 'story-1', 'create-branch'),
    },
    {
      label: 'Mark test complete',
      onClick: bindAction(reportStepComplete, 'story-1', 'test-story'),
    },
  ];
  return (
    <>
      {actions.map(({ label, onClick }) => (
        <button key={label} type="button" onClick={onClick}>
          {label}
        </button>
      ))}
      <output data-testid="guide-status">{progress.status}</output>
      <Link to="/stories/story-1/play?mode=simulation">Go to Simulation</Link>
    </>
  );
}

function bindAction<Arguments extends unknown[]>(
  action: (...args: Arguments) => void,
  ...args: Arguments
) {
  return () => {
    action(...args);
  };
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
        <aside data-onboarding-target="scene-inspector">
          Inspector target
          <button data-onboarding-target="scene-content" type="button">
            Add content target
          </button>
        </aside>
        <button data-onboarding-target="branch-add" type="button">
          Branch target
        </button>
        <Link data-onboarding-target="simulation-launch" to="/stories/story-1/play?mode=simulation">
          Simulation target
        </Link>
        {/* A launch whose navigation is blocked, for example by a pending save. */}
        <button data-onboarding-target="simulation-launch" type="button">
          Blocked simulation target
        </button>
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
  await waitFor(() => {
    expect(screen.getByText('New story target')).toHaveClass('onboarding-target-highlight');
  });
});

it('starts at the scene and highlights Add content without trapping focus', async () => {
  const user = userEvent.setup();
  renderGuide('/stories/story-1/edit');
  await user.click(screen.getByRole('button', { name: 'Start guide' }));

  expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Write a scene' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.getByText('Add content target')).toHaveClass('onboarding-target-highlight');
  });
  expect(screen.getByText('Interaction target')).not.toHaveClass('onboarding-target-highlight');
  const guideCard = screen.getByRole('region', { name: 'Write a scene' });
  expect(guideCard.parentElement).toHaveClass('onboarding-guide-positioner');
  const guideLayer = guideCard.parentElement?.parentElement;
  expect(guideLayer).toHaveClass('onboarding-guide-layer');
  expect(guideLayer?.parentElement).toBe(document.body);

  await user.click(screen.getByRole('button', { name: 'Close guide' }));
  await waitFor(() => {
    expect(screen.queryByRole('heading', { name: 'Write a scene' })).not.toBeInTheDocument();
  });
});

it('falls back to the Inspector once the scene editor is open', async () => {
  const user = userEvent.setup();
  renderGuide('/stories/story-1/edit');
  await user.click(screen.getByRole('button', { name: 'Start guide' }));
  await waitFor(() => {
    expect(screen.getByText('Add content target')).toHaveClass('onboarding-target-highlight');
  });

  screen.getByText('Add content target').remove();

  await waitFor(() => {
    expect(screen.getByText('Inspector target')).toHaveClass('onboarding-target-highlight');
  });
});

it('closes without a completion card when Simulation is launched from the guide', async () => {
  const user = userEvent.setup();
  renderGuide('/stories/story-1/edit');
  await user.click(screen.getByRole('button', { name: 'Start guide' }));
  await user.click(screen.getByRole('button', { name: 'Mark scene saved' }));
  await waitFor(() => {
    expect(screen.getByText('Branch target')).toHaveClass('onboarding-target-highlight');
  });
  await user.click(screen.getByRole('button', { name: 'Mark branch created' }));
  await waitFor(() => {
    expect(screen.getByText('Simulation target')).toHaveClass('onboarding-target-highlight');
  });

  await user.click(screen.getByRole('link', { name: 'Simulation target' }));

  expect(screen.getByTestId('guide-status')).toHaveTextContent('complete');
  await waitFor(() => {
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
  expect(screen.queryByText(/ready/i)).not.toBeInTheDocument();
});

it('keeps the test step when the Simulation launch does not navigate', async () => {
  const user = userEvent.setup();
  renderGuide('/stories/story-1/edit');
  await user.click(screen.getByRole('button', { name: 'Start guide' }));
  await user.click(screen.getByRole('button', { name: 'Mark scene saved' }));
  await user.click(screen.getByRole('button', { name: 'Mark branch created' }));

  await user.click(screen.getByRole('button', { name: 'Blocked simulation target' }));

  expect(screen.getByTestId('guide-status')).toHaveTextContent('active');
  expect(screen.getByRole('heading', { name: 'Test your story' })).toBeInTheDocument();

  await user.click(screen.getByRole('link', { name: 'Simulation target' }));
  expect(screen.getByTestId('guide-status')).toHaveTextContent('complete');
});

it('never covers Simulation with a guide step', async () => {
  const user = userEvent.setup();
  renderGuide('/stories/story-1/edit');
  await user.click(screen.getByRole('button', { name: 'Start guide' }));
  await user.click(screen.getByRole('button', { name: 'Mark scene saved' }));
  await user.click(screen.getByRole('button', { name: 'Mark branch created' }));

  await user.click(screen.getByRole('link', { name: 'Go to Simulation' }));

  expect(screen.getByTestId('guide-status')).toHaveTextContent('active');
  await waitFor(() => {
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });
});

it('can restart the guide from the help control', async () => {
  const user = userEvent.setup();
  renderGuide('/stories/story-1/edit');
  await user.click(screen.getByRole('button', { name: 'Start guide' }));
  await user.click(screen.getByRole('button', { name: 'Mark scene saved' }));
  await user.click(screen.getByRole('button', { name: 'Restart guide' }));

  expect(screen.getByRole('heading', { name: 'Write a scene' })).toBeInTheDocument();
});
