import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18n } from '../../i18n';
import { FeedbackButton } from './FeedbackButton';
import { formbricksFeedbackClient } from './formbricksClient';

describe('FeedbackButton', () => {
  const environmentConfiguration = formbricksFeedbackClient.isConfigured;

  beforeEach(() => {
    formbricksFeedbackClient.isConfigured = true;
    vi.spyOn(formbricksFeedbackClient, 'setup').mockResolvedValue(true);
    vi.spyOn(formbricksFeedbackClient, 'registerRouteChange').mockResolvedValue(true);
    vi.spyOn(formbricksFeedbackClient, 'trackFeedback').mockResolvedValue(true);
  });

  afterEach(() => {
    formbricksFeedbackClient.isConfigured = environmentConfiguration;
    vi.restoreAllMocks();
    cleanup();
  });

  it('opens the configured action with normalized contextual metadata', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/stories/private-story/edit?panel=context']}>
        <FeedbackButton />
      </MemoryRouter>,
    );

    const button = await screen.findByRole('button', { name: 'Give feedback' });
    await waitFor(() =>
      expect(formbricksFeedbackClient.registerRouteChange).toHaveBeenCalledWith('en'),
    );
    await user.click(button);

    await waitFor(() =>
      expect(formbricksFeedbackClient.trackFeedback).toHaveBeenCalledWith(
        'en',
        expect.objectContaining({
          paralleax_route: '/stories/:storyId/edit',
          paralleax_surface: 'editor',
          paralleax_version: '0.1.0',
          paralleax_language: 'en',
        }),
      ),
    );
    expect(formbricksFeedbackClient.trackFeedback).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ storyId: expect.anything() }),
    );
  });

  it('uses the localized label and survey language', async () => {
    await i18n.changeLanguage('fr');
    render(
      <MemoryRouter>
        <FeedbackButton />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('button', { name: 'Donner un retour' })).toBeInTheDocument();
    await waitFor(() =>
      expect(formbricksFeedbackClient.registerRouteChange).toHaveBeenCalledWith('fr'),
    );
  });

  it('stays absent when the integration is disabled or setup fails', async () => {
    formbricksFeedbackClient.isConfigured = false;
    render(
      <MemoryRouter>
        <FeedbackButton />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Give feedback' })).not.toBeInTheDocument();

    cleanup();
    formbricksFeedbackClient.isConfigured = true;
    vi.mocked(formbricksFeedbackClient.setup).mockResolvedValue(false);
    render(
      <MemoryRouter>
        <FeedbackButton />
      </MemoryRouter>,
    );
    await waitFor(() => expect(formbricksFeedbackClient.setup).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Give feedback' })).not.toBeInTheDocument();
  });
});
