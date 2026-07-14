import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { StoryList } from './StoryList';
import { api } from '../api';

vi.mock('../api', () => ({
  api: {
    listStories: vi.fn(),
    createStory: vi.fn(),
    deleteStory: vi.fn(),
  },
}));

const stories: Story[] = [
  {
    id: 'story-1',
    title: 'Premiere histoire',
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    interactions: [],
  },
  {
    id: 'story-2',
    title: 'Deuxieme histoire',
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    interactions: [{ id: 'interaction-1', title: 'Depart', body: '', position: { x: 0, y: 0 }, triggers: [] }],
  },
];

describe('StoryList', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads and displays stories with edit and play links', async () => {
    vi.mocked(api.listStories).mockResolvedValue(structuredClone(stories));

    render(<MemoryRouter><StoryList /></MemoryRouter>);

    expect(await screen.findByRole('heading', { name: 'Premiere histoire' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Deuxieme histoire' })).toBeInTheDocument();
    expect(screen.getByText('0 interaction(s)')).toBeInTheDocument();
    expect(screen.getByText('1 interaction(s)')).toBeInTheDocument();

    const firstCard = screen.getByRole('heading', { name: 'Premiere histoire' }).closest('article')!;
    expect(within(firstCard).getByRole('link', { name: /diter/i })).toHaveAttribute('href', '/stories/story-1/edit');
    expect(within(firstCard).getByRole('link', { name: 'Lire' })).toHaveAttribute('href', '/stories/story-1/play');
  });

  it('creates and deletes a story from the list', async () => {
    const user = userEvent.setup();
    const createdStory: Story = {
      id: 'story-3',
      title: 'Nouvelle histoire',
      createdAt: '2026-07-14T08:00:00.000Z',
      updatedAt: '2026-07-14T08:00:00.000Z',
      interactions: [],
    };
    vi.mocked(api.listStories).mockResolvedValue([structuredClone(stories[0])]);
    vi.mocked(api.createStory).mockResolvedValue(createdStory);
    vi.mocked(api.deleteStory).mockResolvedValue(undefined);

    render(<MemoryRouter><StoryList /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Premiere histoire' });

    await user.click(screen.getByRole('button', { name: 'Nouvelle histoire' }));
    expect(await screen.findByRole('heading', { name: 'Nouvelle histoire' })).toBeInTheDocument();

    const firstCard = screen.getByRole('heading', { name: 'Premiere histoire' }).closest('article')!;
    await user.click(within(firstCard).getByRole('button', { name: 'Supprimer' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Premiere histoire' })).not.toBeInTheDocument());
    expect(api.deleteStory).toHaveBeenCalledWith('story-1');
  });

  it('shows a loading error', async () => {
    vi.mocked(api.listStories).mockRejectedValue(new Error('API indisponible'));

    render(<MemoryRouter><StoryList /></MemoryRouter>);

    expect(await screen.findByText('API indisponible')).toBeInTheDocument();
  });
});
