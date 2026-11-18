import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OnboardingProvider } from './OnboardingProvider';
import { useOnboarding } from './onboardingContext';
import { currentOnboardingStep } from './onboardingProgress';

afterEach(cleanup);

function OnboardingProbe() {
  const onboarding = useOnboarding();
  const step = currentOnboardingStep(onboarding.progress);
  const actions = [
    { label: 'Begin', onClick: bindAction(onboarding.beginForStory, 'story-1') },
    {
      label: 'Select interaction',
      onClick: bindAction(onboarding.reportStepComplete, 'story-1', 'discover-interactions'),
    },
    {
      label: 'Report existing content',
      onClick: bindAction(onboarding.reportStoryState, 'story-1', true, true),
    },
    {
      label: 'Complete test',
      onClick: bindAction(onboarding.reportStepComplete, 'story-1', 'test-story'),
    },
    { label: 'Close', onClick: onboarding.pause },
    { label: 'Help', onClick: bindAction(onboarding.openHelp, 'story-1') },
    { label: 'Delete story', onClick: bindAction(onboarding.reportStoryDeleted, 'story-1') },
  ];
  return (
    <div>
      <p role="status">{`${onboarding.progress.status}:${step ?? 'done'}`}</p>
      {actions.map(({ label, onClick }) => (
        <button key={label} type="button" onClick={onClick}>
          {label}
        </button>
      ))}
    </div>
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

function renderOnboarding() {
  return render(
    <OnboardingProvider userId="author-1">
      <OnboardingProbe />
    </OnboardingProvider>,
  );
}

describe('OnboardingProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

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

  it('pauses a completed guide and resumes at its completion screen', async () => {
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(screen.getByRole('button', { name: 'Begin' }));
    await user.click(screen.getByRole('button', { name: 'Select interaction' }));
    await user.click(screen.getByRole('button', { name: 'Report existing content' }));
    await user.click(screen.getByRole('button', { name: 'Complete test' }));
    expect(screen.getByRole('status')).toHaveTextContent('complete:done');

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.getByRole('status')).toHaveTextContent('paused:done');
    await user.click(screen.getByRole('button', { name: 'Help' }));
    expect(screen.getByRole('status')).toHaveTextContent('active:done');
  });
});
