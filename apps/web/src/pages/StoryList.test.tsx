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
    title: 'First story',
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    interactions: [],
  },
  {
    id: 'story-2',
    title: 'Second story',
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    interactions: [{ id: 'interaction-1', title: 'Start', body: '', position: { x: 0, y: 0 }, triggers: [] }],
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

    expect(await screen.findByRole('heading', { name: 'First story' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Second story' })).toBeInTheDocument();
    expect(screen.getByText('0 interaction(s)')).toBeInTheDocument();
    expect(screen.getByText('1 interaction(s)')).toBeInTheDocument();

    const firstCard = screen.getByRole('heading', { name: 'First story' }).closest('article')!;
    expect(within(firstCard).getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/stories/story-1/edit');
    expect(within(firstCard).getByRole('link', { name: 'Read' })).toHaveAttribute('href', '/stories/story-1/play');
  });

  it('creates and deletes a story from the list', async () => {
    const user = userEvent.setup();
    const createdStory: Story = {
      id: 'story-3',
      title: 'New story',
      createdAt: '2026-07-14T08:00:00.000Z',
      updatedAt: '2026-07-14T08:00:00.000Z',
      interactions: [],
    };
    vi.mocked(api.listStories).mockResolvedValue([structuredClone(stories[0])]);
    vi.mocked(api.createStory).mockResolvedValue(createdStory);
    vi.mocked(api.deleteStory).mockResolvedValue(undefined);

    render(<MemoryRouter><StoryList /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'First story' });

    await user.click(screen.getByRole('button', { name: 'New story' }));
    expect(await screen.findByRole('heading', { name: 'New story' })).toBeInTheDocument();

    const firstCard = screen.getByRole('heading', { name: 'First story' }).closest('article')!;
    await user.click(within(firstCard).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'First story' })).not.toBeInTheDocument());
    expect(api.deleteStory).toHaveBeenCalledWith('story-1');
  });

  it('shows a loading error', async () => {
    vi.mocked(api.listStories).mockRejectedValue(new Error('API unavailable'));

    render(<MemoryRouter><StoryList /></MemoryRouter>);

    expect(await screen.findByText('API unavailable')).toBeInTheDocument();
  });
});
