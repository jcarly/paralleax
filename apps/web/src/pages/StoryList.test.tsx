import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Story, StorySummary } from '@paralleax/shared';
import { StoryList } from './StoryList';
import { api } from '../api';
import { loadStoryEditor, loadStoryPlayer } from './storyRouteLoaders';

vi.mock('../api', () => ({
  api: {
    listStories: vi.fn(),
    createStory: vi.fn(),
    createDemoStory: vi.fn(),
    deleteStory: vi.fn(),
  },
}));

vi.mock('./storyRouteLoaders', () => ({
  loadStoryEditor: vi.fn(() => Promise.resolve()),
  loadStoryPlayer: vi.fn(() => Promise.resolve()),
}));

const stories: StorySummary[] = [
  {
    id: 'story-1',
    title: 'First story',
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    interactionCount: 0,
  },
  {
    id: 'story-2',
    title: 'Second story',
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    interactionCount: 1,
  },
];

describe('StoryList', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads and displays stories with edit and play links', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listStories).mockResolvedValue(structuredClone(stories));

    render(
      <MemoryRouter>
        <StoryList />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'First story' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Second story' })).toBeInTheDocument();
    expect(screen.getByText('0 interaction(s)')).toBeInTheDocument();
    expect(screen.getByText('1 interaction(s)')).toBeInTheDocument();

    const firstCard = screen.getByRole('heading', { name: 'First story' }).closest('article')!;
    expect(within(firstCard).getByRole('link', { name: 'Edit' })).toHaveAttribute(
      'href',
      '/stories/story-1/edit',
    );
    expect(within(firstCard).getByRole('link', { name: 'Read' })).toHaveAttribute(
      'href',
      '/stories/story-1/play',
    );

    await user.hover(within(firstCard).getByRole('link', { name: 'Edit' }));
    expect(loadStoryEditor).toHaveBeenCalledOnce();
    await user.hover(within(firstCard).getByRole('link', { name: 'Read' }));
    expect(loadStoryPlayer).toHaveBeenCalledOnce();
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

    render(
      <MemoryRouter>
        <StoryList />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'First story' });

    await user.click(screen.getByRole('button', { name: 'New story' }));
    expect(await screen.findByRole('heading', { name: 'New story' })).toBeInTheDocument();

    const firstCard = screen.getByRole('heading', { name: 'First story' }).closest('article')!;
    await user.click(within(firstCard).getByRole('button', { name: 'Delete' }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'First story' })).not.toBeInTheDocument(),
    );
    expect(api.deleteStory).toHaveBeenCalledWith('story-1');
  });

  it('creates a demo story from the list', async () => {
    const user = userEvent.setup();
    const demoStory: Story = {
      id: 'story-demo',
      title: 'Demo: branching investigation',
      createdAt: '2026-07-14T08:00:00.000Z',
      updatedAt: '2026-07-14T08:00:00.000Z',
      interactions: [
        {
          id: 'demo-root',
          title: 'Root',
          body: '',
          position: { x: 80, y: 120 },
          triggers: [{ id: 'demo-trigger', inputInteractionIds: [], conditions: [] }],
        },
      ],
    };
    vi.mocked(api.listStories).mockResolvedValue([structuredClone(stories[0])]);
    vi.mocked(api.createDemoStory).mockResolvedValue(demoStory);

    render(
      <MemoryRouter>
        <StoryList />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'First story' });

    await user.click(screen.getByRole('button', { name: 'Generate demo' }));

    const demoCard = (
      await screen.findByRole('heading', {
        name: 'Demo: branching investigation',
      })
    ).closest('article')!;
    expect(within(demoCard).getByText('1 interaction(s)')).toBeInTheDocument();
    expect(api.createDemoStory).toHaveBeenCalledOnce();
  });

  it('shows a loading error', async () => {
    vi.mocked(api.listStories).mockRejectedValue(new Error('API unavailable'));

    render(
      <MemoryRouter>
        <StoryList />
      </MemoryRouter>,
    );

    expect(await screen.findByText('API unavailable')).toBeInTheDocument();
  });
});
