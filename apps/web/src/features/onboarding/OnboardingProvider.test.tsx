import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OnboardingProvider, useOnboarding } from './OnboardingProvider';
import { currentOnboardingStep } from './onboardingProgress';

afterEach(cleanup);

function OnboardingProbe() {
  const onboarding = useOnboarding();
  const step = currentOnboardingStep(onboarding.progress);
  return (
    <div>
      <p role="status">{`${onboarding.progress.status}:${step ?? 'done'}`}</p>
      <button type="button" onClick={() => onboarding.beginForStory('story-1')}>
        Begin
      </button>
      <button
        type="button"
        onClick={() => onboarding.reportStepComplete('story-1', 'discover-interactions')}
      >
        Select interaction
      </button>
      <button
        type="button"
        onClick={() => onboarding.reportStoryState('story-1', true, true)}
      >
        Report existing content
      </button>
      <button type="button" onClick={onboarding.pause}>
        Close
      </button>
      <button type="button" onClick={() => onboarding.openHelp('story-1')}>
        Help
      </button>
      <button type="button" onClick={() => onboarding.reportStoryDeleted('story-1')}>
        Delete story
      </button>
    </div>
  );
}

function renderOnboarding() {
  return render(
    <OnboardingProvider userId="author-1">
      <OnboardingProbe />
    </OnboardingProvider>,
  );
}

describe('OnboardingProvider', () => {
  beforeEach(() => window.localStorage.clear());

  it('starts from a created story and advances from reported actions', async () => {
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(screen.getByRole('button', { name: 'Begin' }));
    expect(screen.getByRole('status')).toHaveTextContent('active:discover-interactions');

    await user.click(screen.getByRole('button', { name: 'Select interaction' }));
    expect(screen.getByRole('status')).toHaveTextContent('active:write-scene');

    await user.click(screen.getByRole('button', { name: 'Report existing content' }));
    expect(screen.getByRole('status')).toHaveTextContent('active:test-story');
  });

  it('pauses and resumes without losing progress after an interruption', async () => {
    const user = userEvent.setup();
    const first = renderOnboarding();
    await user.click(screen.getByRole('button', { name: 'Begin' }));
    await user.click(screen.getByRole('button', { name: 'Select interaction' }));
    first.unmount();

    renderOnboarding();
    expect(screen.getByRole('status')).toHaveTextContent('active:write-scene');
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('status')).toHaveTextContent('paused:write-scene');
    await user.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByRole('status')).toHaveTextContent('active:write-scene');
  });

  it('clears an unavailable story target while retaining a paused guide', async () => {
    const user = userEvent.setup();
    renderOnboarding();
    await user.click(screen.getByRole('button', { name: 'Begin' }));
    await user.click(screen.getByRole('button', { name: 'Delete story' }));

    expect(screen.getByRole('status')).toHaveTextContent('paused:discover-interactions');
  });
});
