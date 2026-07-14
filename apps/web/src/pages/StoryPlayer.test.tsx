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
  },
}));

const story: Story = {
  id: 'story-1',
  title: 'Histoire jouable',
  createdAt: '2026-07-14T08:00:00.000Z',
  updatedAt: '2026-07-14T08:00:00.000Z',
  interactions: [
    {
      id: 'start',
      title: 'Depart',
      body: 'Vous arrivez.',
      position: { x: 0, y: 0 },
      triggers: [{ id: 'trigger-start', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'next',
      title: 'Suite',
      body: 'Vous continuez.',
      position: { x: 100, y: 0 },
      triggers: [{ id: 'trigger-next', inputInteractionIds: ['start'], conditions: [] }],
    },
    {
      id: 'hidden',
      title: 'Secret',
      body: 'Vous avez trouve un secret.',
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

async function renderPlayer() {
  vi.mocked(api.getStory).mockResolvedValue(structuredClone(story));

  render(
    <MemoryRouter initialEntries={['/stories/story-1/play']}>
      <Routes>
        <Route path="/stories/:storyId/play" element={<StoryPlayer />} />
      </Routes>
    </MemoryRouter>,
  );

  await screen.findByText('Histoire jouable');
}

describe('StoryPlayer', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads a story and follows available choices', async () => {
    const user = userEvent.setup();
    await renderPlayer();

    expect(screen.getByRole('heading', { name: /Commencer/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Depart' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suite' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Depart' }));
    expect(screen.getByRole('heading', { name: 'Depart' })).toBeInTheDocument();
    expect(screen.getByText('Vous arrivez.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suite' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Suite' }));
    expect(screen.getByRole('heading', { name: 'Suite' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Secret' })).toBeInTheDocument();
    expect(screen.getByText('Depart')).toBeInTheDocument();
  });

  it('shows an ending and can restart', async () => {
    const user = userEvent.setup();
    await renderPlayer();

    await user.click(screen.getByRole('button', { name: 'Depart' }));
    await user.click(screen.getByRole('button', { name: 'Suite' }));
    await user.click(screen.getByRole('button', { name: 'Secret' }));

    expect(screen.getByRole('heading', { name: 'Secret' })).toBeInTheDocument();
    expect(screen.getByText('Fin de cette branche.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Recommencer' }));
    expect(screen.getByRole('heading', { name: /Commencer/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Depart' })).toBeInTheDocument();
  });
});
