import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { StoryPlayer } from './StoryPlayer';
import { api } from '../api';

vi.mock('../api', () => ({
  api: {
    getStory: vi.fn(),
    updateInteraction: vi.fn(),
  },
}));

const story: Story = {
  id: 'story-1',
  title: 'Playable story',
  createdAt: '2026-07-14T08:00:00.000Z',
  updatedAt: '2026-07-14T08:00:00.000Z',
  interactions: [
    {
      id: 'start',
      title: 'Start',
      body: 'You arrive.',
      position: { x: 0, y: 0 },
      triggers: [{ id: 'trigger-start', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'next',
      title: 'Next',
      body: 'You continue.',
      position: { x: 100, y: 0 },
      triggers: [{ id: 'trigger-next', inputInteractionIds: ['start'], conditions: [] }],
    },
    {
      id: 'hidden',
      title: 'Secret',
      body: 'You found a secret.',
      position: { x: 200, y: 0 },
      triggers: [
        {
          id: 'trigger-hidden',
          inputInteractionIds: ['next'],
          conditions: [{ interactionId: 'start', hasBeenVisited: true }],
        },
      ],
    },
  ],
};

async function renderPlayer(initialEntry = '/stories/story-1/play') {
  vi.mocked(api.getStory).mockResolvedValue(structuredClone(story));

  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/stories/:storyId/play" element={<StoryPlayer />} />
      </Routes>
    </MemoryRouter>,
  );

  await screen.findByText('Playable story');
}

describe('StoryPlayer', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads a story and follows available choices', async () => {
    const user = userEvent.setup();
    await renderPlayer();

    expect(screen.getByRole('heading', { name: /Start the story/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByRole('heading', { name: 'Start' })).toBeInTheDocument();
    expect(screen.getByText('You arrive.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('heading', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Secret' })).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  it('shows an ending and can restart', async () => {
    const user = userEvent.setup();
    await renderPlayer();

    await user.click(screen.getByRole('button', { name: 'Start' }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Secret' }));

    expect(screen.getByRole('heading', { name: 'Secret' })).toBeInTheDocument();
    expect(screen.getByText('End of this branch.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restart' }));
    expect(screen.getByRole('heading', { name: /Start the story/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('can start from a specific interaction', async () => {
    const user = userEvent.setup();
    await renderPlayer('/stories/story-1/play?startInteractionId=next');

    expect(screen.getByRole('heading', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByText('You continue.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Start the story/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Restart' }));

    expect(screen.getByRole('heading', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByText('You continue.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Current interaction title')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Current interaction content')).not.toBeInTheDocument();
  });

  it('shows unavailable interactions in simulation mode and lets authors force them', async () => {
    const user = userEvent.setup();
    await renderPlayer('/stories/story-1/play?mode=simulation&startInteractionId=next');

    expect(screen.getByText('Simulation')).toBeInTheDocument();
    expect(screen.getByLabelText('Current interaction title')).toHaveValue('Next');
    expect(screen.getByRole('button', { name: 'Back' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Secret/ })).toHaveClass('unavailable');
    expect(screen.getByText('Requires "Start" to be visited.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Secret/ }));

    expect(screen.getByLabelText('Current interaction title')).toHaveValue('Secret');
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.queryByText('End of this branch.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByLabelText('Current interaction title')).toHaveValue('Next');
    expect(screen.getByRole('button', { name: /Secret/ })).toHaveClass('unavailable');
    expect(screen.getByText('Requires "Start" to be visited.')).toBeInTheDocument();
  });

  it('edits the current title and content inline in simulation mode', async () => {
    const user = userEvent.setup();
    const renamed = structuredClone(story);
    renamed.interactions[1].title = 'Renamed step';
    const rewritten = structuredClone(renamed);
    rewritten.interactions[1].body = 'Rewritten content.';
    vi.mocked(api.updateInteraction)
      .mockResolvedValueOnce(renamed)
      .mockResolvedValueOnce(rewritten);

    await renderPlayer('/stories/story-1/play?mode=simulation&startInteractionId=next');

    const titleInput = screen.getByLabelText('Current interaction title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Renamed step');
    await user.tab();

    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'next', {
      title: 'Renamed step',
    });
    expect(await screen.findByDisplayValue('Renamed step')).toBeInTheDocument();

    const bodyInput = screen.getByLabelText('Current interaction content');
    await user.clear(bodyInput);
    await user.type(bodyInput, 'Rewritten content.');
    await user.tab();

    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'next', {
      body: 'Rewritten content.',
    });
    expect(await screen.findByDisplayValue('Rewritten content.')).toBeInTheDocument();
  });
});
