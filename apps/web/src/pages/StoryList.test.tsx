import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Story, StorySummary } from '@paralleax/shared';
import { StoryList } from './StoryList';
import { api } from '../api';
import { loadStoryEditor, loadStoryPlayer } from './storyRouteLoaders';
import { i18n } from '../i18n';

vi.mock('../api', () => ({
  api: {
    listStories: vi.fn(),
    listPublicStories: vi.fn(),
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
    expect(
      within(screen.getByRole('heading', { name: 'First story' }).closest('article')!).getByText(
        '0',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('heading', { name: 'Second story' }).closest('article')!).getByText(
        '1',
      ),
    ).toBeInTheDocument();

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

  it('loads the public catalogue without authoring actions', async () => {
    vi.mocked(api.listPublicStories).mockResolvedValue([
      {
        ...structuredClone(stories[0]),
        access: { visibility: 'public', editPolicy: 'owner', commentPolicy: 'disabled' },
        capabilities: { canRead: true, canEdit: false, canManage: false, canComment: false },
      },
    ]);

    render(
      <MemoryRouter>
        <StoryList mode="public" />
      </MemoryRouter>,
    );

    const card = (await screen.findByRole('heading', { name: 'First story' })).closest('article')!;
    expect(screen.getByRole('heading', { name: 'Public stories' })).toBeInTheDocument();
    expect(api.listPublicStories).toHaveBeenCalledOnce();
    expect(api.listStories).not.toHaveBeenCalled();
    expect(within(card).getByRole('link', { name: 'Read' })).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: 'Access' })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New story' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generate demo' })).not.toBeInTheDocument();
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
    await user.type(screen.getByLabelText('Story title'), 'New story');
    await user.click(screen.getByRole('button', { name: 'Create story' }));
    expect(await screen.findByRole('heading', { name: 'New story' })).toBeInTheDocument();
    expect(api.createStory).toHaveBeenCalledWith('New story');

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
    expect(within(demoCard).getByText('1')).toBeInTheDocument();
    expect(api.createDemoStory).toHaveBeenCalledOnce();
  });

  it('searches, filters, and switches the story layout locally', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listStories).mockResolvedValue(structuredClone(stories));

    render(
      <MemoryRouter>
        <StoryList />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'First story' });

    await user.type(screen.getByRole('searchbox', { name: 'Search stories' }), 'Second');
    expect(screen.queryByRole('heading', { name: 'First story' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Second story' })).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Search stories' }));
    await user.click(screen.getByRole('button', { name: 'Empty' }));
    expect(screen.getByRole('heading', { name: 'First story' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Second story' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
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

  it('only shows actions allowed by resolved story capabilities', async () => {
    vi.mocked(api.listStories).mockResolvedValue([
      {
        ...stories[0],
        access: { visibility: 'public', editPolicy: 'owner', commentPolicy: 'disabled' },
        capabilities: { canRead: true, canEdit: false, canManage: false, canComment: false },
      },
    ]);

    render(
      <MemoryRouter>
        <StoryList />
      </MemoryRouter>,
    );
    const card = (await screen.findByRole('heading', { name: 'First story' })).closest('article')!;
    expect(within(card).getByText('Public')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Read' })).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: 'Access' })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('translates product copy without changing authored story titles', async () => {
    await i18n.changeLanguage('fr');
    vi.mocked(api.listStories).mockResolvedValue([structuredClone(stories[0])]);

    render(
      <MemoryRouter>
        <StoryList />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'First story' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Histoires' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nouvelle histoire' })).toBeInTheDocument();
  });
});
