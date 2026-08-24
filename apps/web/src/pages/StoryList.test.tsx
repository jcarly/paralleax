import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Story, StorySummary } from '@paralleax/shared';
import { StoryList } from './StoryList';
import { api, type AuthUser } from '../api';
import { loadStoryEditor, loadStoryPlayer } from './storyRouteLoaders';
import { i18n } from '../i18n';

vi.mock('../api', () => ({
  api: {
    listStories: vi.fn(),
    listPublicStories: vi.fn(),
    createStory: vi.fn(),
    createDemoStory: vi.fn(),
    importChoiceScript: vi.fn(),
    deleteStory: vi.fn(),
  },
}));

vi.mock('./storyRouteLoaders', () => ({
  loadStoryEditor: vi.fn(() => Promise.resolve()),
  loadStoryPlayer: vi.fn(() => Promise.resolve()),
}));

const standardUser: AuthUser = {
  id: 'user-1',
  email: 'author@example.com',
  role: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const administrator: AuthUser = {
  ...standardUser,
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
};

const stories: StorySummary[] = [
  {
    id: 'story-1',
    title: 'First story',
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    interactionCount: 0,
    access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
    capabilities: { canRead: true, canEdit: true, canManage: true, canComment: true },
    owner: { id: standardUser.id, email: standardUser.email },
  },
  {
    id: 'story-2',
    title: 'Second story',
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    interactionCount: 1,
    access: {
      visibility: 'authenticated',
      editPolicy: 'owner',
      commentPolicy: 'readers',
    },
    capabilities: { canRead: true, canEdit: false, canManage: false, canComment: true },
    owner: { id: 'user-2', email: 'reviewer@example.com' },
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
        <StoryList user={standardUser} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'First story' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Second story' })).toBeInTheDocument();
    expect(api.listStories).toHaveBeenCalledOnce();
    expect(api.listPublicStories).not.toHaveBeenCalled();
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
    expect(screen.getByRole('button', { name: 'New story' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generate demo' })).not.toBeInTheDocument();

    await user.hover(within(firstCard).getByRole('link', { name: 'Edit' }));
    expect(loadStoryEditor).toHaveBeenCalledOnce();
    await user.hover(within(firstCard).getByRole('link', { name: 'Read' }));
    expect(loadStoryPlayer).toHaveBeenCalledOnce();
  });

  it('loads the anonymous catalogue without authoring actions', async () => {
    vi.mocked(api.listPublicStories).mockResolvedValue([
      {
        ...structuredClone(stories[0]),
        access: { visibility: 'public', editPolicy: 'owner', commentPolicy: 'editors' },
        capabilities: { canRead: true, canEdit: false, canManage: false, canComment: false },
      },
    ]);

    render(
      <MemoryRouter>
        <StoryList user={null} />
      </MemoryRouter>,
    );

    const card = (await screen.findByRole('heading', { name: 'First story' })).closest('article')!;
    expect(screen.getByRole('heading', { name: 'Stories' })).toBeInTheDocument();
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
        <StoryList user={standardUser} />
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
        <StoryList user={administrator} />
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

  it('imports ChoiceScript scene files and displays the compatibility report', async () => {
    const user = userEvent.setup();
    const importedStory: Story = {
      id: 'story-imported',
      title: 'Imported story',
      createdAt: '2026-08-22T08:00:00.000Z',
      updatedAt: '2026-08-22T08:00:00.000Z',
      interactions: [
        {
          id: 'interaction-imported',
          title: 'Startup',
          body: '<p>Imported prose.</p>',
          position: { x: 80, y: 120 },
          triggers: [{ id: 'trigger-imported', inputInteractionIds: [], conditions: [] }],
        },
      ],
    };
    vi.mocked(api.listStories).mockResolvedValue([]);
    vi.mocked(api.importChoiceScript).mockResolvedValue({
      story: importedStory,
      report: {
        format: 'choicescript',
        sourceFileCount: 2,
        sceneCount: 2,
        interactionCount: 1,
        convertedCommandCount: 2,
        approximatedCommandCount: 1,
        ignoredCommandCount: 1,
        issues: [
          {
            severity: 'warning',
            code: 'unsupported_set',
            message: 'The *set command was ignored.',
            fileName: 'startup.txt',
            line: 3,
          },
        ],
      },
    });

    render(
      <MemoryRouter>
        <StoryList user={standardUser} />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'No stories found' });

    await user.click(screen.getByRole('button', { name: 'Import ChoiceScript' }));
    const startup = new File(['*title Imported story\n*set score 1\nStart.'], 'startup.txt', {
      type: 'text/plain',
    });
    const ending = new File(['The end.\n*ending'], 'ending.txt', { type: 'text/plain' });
    await user.upload(screen.getByLabelText('ChoiceScript scene files'), [startup, ending]);
    expect(screen.getByText('2 files selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Import story' }));

    expect(
      await screen.findByRole('heading', { name: 'ChoiceScript story imported' }),
    ).toBeInTheDocument();
    expect(api.importChoiceScript).toHaveBeenCalledWith([
      { name: 'startup.txt', content: '*title Imported story\n*set score 1\nStart.' },
      { name: 'ending.txt', content: 'The end.\n*ending' },
    ]);
    expect(screen.getByText('The *set command was ignored.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open in editor' })).toHaveAttribute(
      'href',
      '/stories/story-imported/edit',
    );
    expect(screen.getByRole('heading', { name: 'Imported story' })).toBeInTheDocument();
  });

  it('searches, filters by resolved capabilities and ownership, and switches layout', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listStories).mockResolvedValue(structuredClone(stories));

    render(
      <MemoryRouter>
        <StoryList user={standardUser} />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'First story' });

    await user.type(screen.getByRole('searchbox', { name: 'Search stories' }), 'Second');
    expect(screen.queryByRole('heading', { name: 'First story' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Second story' })).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Search stories' }));
    await user.click(screen.getByRole('button', { name: 'Editable by me' }));
    expect(screen.getByRole('heading', { name: 'First story' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Second story' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Commentable by me' }));
    expect(screen.getByRole('heading', { name: 'First story' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Second story' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Created by me' }));
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
        <StoryList user={standardUser} />
      </MemoryRouter>,
    );

    expect(await screen.findByText('API unavailable')).toBeInTheDocument();
  });

  it('only shows actions allowed by resolved story capabilities', async () => {
    vi.mocked(api.listStories).mockResolvedValue([
      {
        ...stories[0],
        access: { visibility: 'public', editPolicy: 'owner', commentPolicy: 'editors' },
        capabilities: { canRead: true, canEdit: false, canManage: false, canComment: false },
      },
    ]);

    render(
      <MemoryRouter>
        <StoryList user={standardUser} />
      </MemoryRouter>,
    );
    const card = (await screen.findByRole('heading', { name: 'First story' })).closest('article')!;
    expect(within(card).getByText('Public')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Read' })).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: 'Access' })).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });

  it('keeps commenter-only readers on the player surface', async () => {
    vi.mocked(api.listStories).mockResolvedValue([
      {
        ...stories[0],
        access: { visibility: 'authenticated', editPolicy: 'owner', commentPolicy: 'readers' },
        capabilities: { canRead: true, canEdit: false, canManage: false, canComment: true },
      },
    ]);

    render(
      <MemoryRouter>
        <StoryList user={standardUser} />
      </MemoryRouter>,
    );
    const card = (await screen.findByRole('heading', { name: 'First story' })).closest('article')!;
    expect(within(card).getByRole('link', { name: 'Read' })).toHaveAttribute(
      'href',
      '/stories/story-1/play',
    );
    expect(within(card).queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: 'Review' })).not.toBeInTheDocument();
  });

  it('translates product copy without changing authored story titles', async () => {
    await i18n.changeLanguage('fr');
    vi.mocked(api.listStories).mockResolvedValue([structuredClone(stories[0])]);

    render(
      <MemoryRouter>
        <StoryList user={standardUser} />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'First story' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Histoires' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nouvelle histoire' })).toBeInTheDocument();
  });
});
