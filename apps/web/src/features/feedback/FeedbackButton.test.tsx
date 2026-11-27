import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { changeInterfaceLanguage } from '../../i18n';
import { FeedbackButton } from './FeedbackButton';
import { postHogFeedbackClient } from './posthogFeedbackClient';

let configured = true;
let notifySubmitted: () => void = () => undefined;

beforeEach(() => {
  configured = true;
  vi.spyOn(postHogFeedbackClient, 'isConfigured', 'get').mockImplementation(() => configured);
  vi.spyOn(postHogFeedbackClient, 'openFeedback').mockResolvedValue('opened');
  vi.spyOn(postHogFeedbackClient, 'onSubmitted').mockImplementation((listener) => {
    notifySubmitted = listener;
    return () => undefined;
  });
});

afterEach(async () => {
  vi.restoreAllMocks();
  cleanup();
  await changeInterfaceLanguage('en');
});

describe('FeedbackButton opening', () => {
  it('waits for an explicit click before opening PostHog and sends normalized context', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/stories/private-story/edit?panel=context']}>
        <FeedbackButton />
      </MemoryRouter>,
    );

    const button = await screen.findByRole('button', { name: 'Give feedback' });
    expect(postHogFeedbackClient.openFeedback).not.toHaveBeenCalled();
    await user.click(button);

    await waitFor(() => {
      expect(postHogFeedbackClient.openFeedback).toHaveBeenCalledWith(
        'en',
        expect.objectContaining({
          paralleax_route: '/stories/:storyId/edit',
          paralleax_surface: 'editor',
          paralleax_version: '0.1.0',
          paralleax_language: 'en',
        }),
      );
    });
    expect(JSON.stringify(vi.mocked(postHogFeedbackClient.openFeedback).mock.calls)).not.toMatch(
      /private-story|panel=context/,
    );
  });
});

describe('FeedbackButton languages', () => {
  it.each([
    ['fr', 'Donner un retour', 'Merci pour votre retour !'],
    ['it', 'Dai un feedback', 'Grazie per il tuo feedback!'],
    ['en', 'Give feedback', 'Thank you for your feedback!'],
  ])('uses the %s label, survey language, and confirmation', async (language, label, sent) => {
    await changeInterfaceLanguage(language);
    render(
      <MemoryRouter>
        <FeedbackButton />
      </MemoryRouter>,
    );

    await userEvent.setup().click(await screen.findByRole('button', { name: label }));
    expect(postHogFeedbackClient.openFeedback).toHaveBeenCalledWith(
      language,
      expect.objectContaining({ paralleax_language: language }),
    );
    expect(screen.queryByText(sent)).not.toBeInTheDocument();
    act(() => {
      notifySubmitted();
    });
    expect(await screen.findByText(sent)).toBeInTheDocument();
  });
});

describe('FeedbackButton states', () => {
  it('can be opened again after a response', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <FeedbackButton />
      </MemoryRouter>,
    );
    const button = await screen.findByRole('button', { name: 'Give feedback' });

    await user.click(button);
    act(() => {
      notifySubmitted();
    });
    await user.click(button);

    expect(postHogFeedbackClient.openFeedback).toHaveBeenCalledTimes(2);
    expect(screen.queryByText('Thank you for your feedback!')).not.toBeInTheDocument();
  });
  it('stays absent when disabled and announces an unavailable survey', async () => {
    configured = false;
    render(
      <MemoryRouter>
        <FeedbackButton />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Give feedback' })).not.toBeInTheDocument();

    cleanup();
    configured = true;
    vi.mocked(postHogFeedbackClient.openFeedback).mockResolvedValue('unavailable');
    render(
      <MemoryRouter>
        <FeedbackButton />
      </MemoryRouter>,
    );
    const button = await screen.findByRole('button', { name: 'Give feedback' });
    await userEvent.setup().click(button);
    expect(
      await screen.findByText('The feedback form is unavailable. Try again later.'),
    ).toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(button).toHaveAccessibleName('Give feedback');
  });
});
