import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Story, StorySummary } from '@paralleax/shared';
import { StoryList } from './StoryList';
import { api, type AuthUser, type QspImportResponse } from '../api';
import { loadStoryEditor, loadStoryPlayer } from './storyRouteLoaders';
import { i18n } from '../i18n';

vi.mock('../api', () => ({
  api: {
    listStories: vi.fn(),
    listPublicStories: vi.fn(),
    createStory: vi.fn(),
    createDemoStories: vi.fn(),
    importChoiceScript: vi.fn(),
    importQsp: vi.fn(),
    importUnlimitedQsp: vi.fn(),
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
  displayName: 'Author',
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
    owner: { id: standardUser.id, displayName: standardUser.displayName },
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
    owner: { id: 'user-2', displayName: 'Reviewer' },
  },
];

describe('StoryList', () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('loads and displays stories with edit and play links', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listStories).mockResolvedValue(storyPage(structuredClone(stories)));

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
    expect(screen.queryByRole('button', { name: 'Generate demos' })).not.toBeInTheDocument();

    const editLink = within(firstCard).getByRole('link', { name: 'Edit' });
    const readLink = within(firstCard).getByRole('link', { name: 'Read' });
    await user.hover(editLink);
    expect(loadStoryEditor).toHaveBeenCalledOnce();
    fireEvent.focus(editLink);
    expect(loadStoryEditor).toHaveBeenCalledTimes(2);
    await user.hover(readLink);
    expect(loadStoryPlayer).toHaveBeenCalledOnce();
    fireEvent.focus(readLink);
    expect(loadStoryPlayer).toHaveBeenCalledTimes(2);
  });

  it('loads the anonymous catalogue without authoring actions', async () => {
    vi.mocked(api.listPublicStories).mockResolvedValue(
      storyPage([
        {
          ...structuredClone(stories[0]),
          access: { visibility: 'public', editPolicy: 'owner', commentPolicy: 'editors' },
          capabilities: { canRead: true, canEdit: false, canManage: false, canComment: false },
        },
      ]),
    );

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
    expect(screen.queryByRole('button', { name: 'Generate demos' })).not.toBeInTheDocument();
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
    vi.mocked(api.listStories)
      .mockResolvedValueOnce(storyPage([structuredClone(stories[0])]))
      .mockResolvedValueOnce(storyPage([]));
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
    expect(api.listStories).toHaveBeenCalledTimes(2);
  });

  it('creates the demo story catalog from the list', async () => {
    const user = userEvent.setup();
    const demoStory: Story = {
      id: 'story-demo',
      title: 'Demo 1: paths only',
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
    vi.mocked(api.listStories).mockResolvedValue(storyPage([structuredClone(stories[0])]));
    const secondDemo = {
      ...demoStory,
      id: 'story-demo-2',
      title: 'Demo 2: visited interaction conditions',
    };
    vi.mocked(api.createDemoStories).mockResolvedValue([demoStory, secondDemo]);

    render(
      <MemoryRouter>
        <StoryList user={administrator} />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'First story' });

    await user.click(screen.getByRole('button', { name: 'Generate demos' }));

    const demoCard = (
      await screen.findByRole('heading', {
        name: 'Demo 1: paths only',
      })
    ).closest('article')!;
    expect(within(demoCard).getByText('1')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Demo 2: visited interaction conditions' }),
    ).toBeInTheDocument();
    expect(api.createDemoStories).toHaveBeenCalledOnce();
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
    vi.mocked(api.listStories).mockResolvedValue(storyPage([]));
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

    await user.click(screen.getByRole('button', { name: 'Import a story' }));
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

  it('imports a QSP game and displays the compatibility coverage matrix', async () => {
    const user = userEvent.setup();
    const importedStory: Story = {
      id: 'story-qsp',
      title: 'QSP story',
      createdAt: '2026-09-02T08:00:00.000Z',
      updatedAt: '2026-09-02T08:00:00.000Z',
      interactions: [
        {
          id: 'interaction-start',
          title: 'Start',
          body: '<p>Start.</p>',
          position: { x: 80, y: 120 },
          triggers: [{ id: 'trigger-start', inputInteractionIds: [], conditions: [] }],
        },
      ],
    };
    vi.mocked(api.listStories).mockResolvedValue(storyPage([]));
    vi.mocked(api.importQsp).mockResolvedValue({
      story: importedStory,
      report: {
        format: 'qsp',
        sourceFileCount: 1,
        locationCount: 1,
        actionCount: 0,
        interactionCount: 1,
        convertedStatementCount: 1,
        approximatedStatementCount: 0,
        unsupportedStatementCount: 0,
        coverage: [
          { feature: 'locations', support: 'supported', occurrences: 1 },
          { feature: 'variables', support: 'partial', occurrences: 0 },
        ],
        issues: [],
      },
    });

    render(
      <MemoryRouter>
        <StoryList user={standardUser} />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'No stories found' });
    await user.click(screen.getByRole('button', { name: 'Import a story' }));
    await user.selectOptions(screen.getByLabelText('Source format'), 'qsp');
    const source = "# Start\n*pl 'Start.'\n---";
    await user.upload(
      screen.getByLabelText('QSP game or location files'),
      new File([source], 'sample.qsps', { type: 'text/plain' }),
    );
    await user.click(screen.getByRole('button', { name: 'Import story' }));

    expect(await screen.findByRole('heading', { name: 'QSP story imported' })).toBeInTheDocument();
    expect(api.importQsp).toHaveBeenCalledWith({
      name: 'sample.qsps',
      format: 'text',
      contentBase64: btoa(source),
    });
    expect(screen.getByText('QSP compatibility coverage')).toBeInTheDocument();
    expect(screen.getByText('Variables, arrays, and expressions')).toBeInTheDocument();
    expect(screen.getByText('Partial')).toBeInTheDocument();
  });

  it('bundles multiple qsrc location files for the QSP importer', async () => {
    const user = userEvent.setup();
    const importedStory: Story = {
      id: 'story-qsrc',
      title: 'QSP locations',
      createdAt: '2026-09-07T08:00:00.000Z',
      updatedAt: '2026-09-07T08:00:00.000Z',
      interactions: [],
    };
    vi.mocked(api.listStories).mockResolvedValue(storyPage([]));
    vi.mocked(api.importQsp).mockResolvedValue({
      story: importedStory,
      report: {
        format: 'qsp',
        sourceFileCount: 2,
        locationCount: 2,
        actionCount: 0,
        interactionCount: 2,
        convertedStatementCount: 0,
        approximatedStatementCount: 0,
        unsupportedStatementCount: 0,
        coverage: [],
        issues: [],
      },
    });

    render(
      <MemoryRouter>
        <StoryList user={standardUser} />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'No stories found' });
    await user.click(screen.getByRole('button', { name: 'Import a story' }));
    await user.selectOptions(screen.getByLabelText('Source format'), 'qsp');
    await user.upload(screen.getByLabelText('QSP game or location files'), [
      new File(['# start\n--- start ---'], 'start.qsrc', { type: 'text/plain' }),
      new File(['# room\n--- room ---'], 'room.qsrc', { type: 'text/plain' }),
    ]);
    await user.click(screen.getByRole('button', { name: 'Import story' }));

    await waitFor(() => expect(api.importQsp).toHaveBeenCalledTimes(1));
    const request = vi.mocked(api.importQsp).mock.calls[0][0];
    expect(request).toMatchObject({ name: 'QSP locations.qsrc', format: 'locations' });
    expect(JSON.parse(atob(request.contentBase64))).toEqual({
      version: 1,
      files: [
        { name: 'start.qsrc', content: '# start\n--- start ---' },
        { name: 'room.qsrc', content: '# room\n--- room ---' },
      ],
    });
  });

  it('streams QSP games larger than the standard limit for administrators', async () => {
    const user = userEvent.setup();
    const importedStory: Story = {
      id: 'story-large-qsp',
      title: 'Large QSP story',
      createdAt: '2026-09-02T08:00:00.000Z',
      updatedAt: '2026-09-02T08:00:00.000Z',
      interactions: [
        {
          id: 'interaction-start',
          title: 'Start',
          body: '<p>Start.</p>',
          position: { x: 80, y: 120 },
          triggers: [{ id: 'trigger-start', inputInteractionIds: [], conditions: [] }],
        },
      ],
    };
    const importResult: QspImportResponse = {
      story: importedStory,
      report: {
        format: 'qsp' as const,
        sourceFileCount: 1,
        locationCount: 1,
        actionCount: 0,
        interactionCount: 1,
        convertedStatementCount: 1,
        approximatedStatementCount: 0,
        unsupportedStatementCount: 0,
        coverage: [{ feature: 'locations', support: 'supported', occurrences: 1 }],
        issues: [],
      },
    };
    let reportUploadProgress: ((percentage: number) => void) | undefined;
    let finishImport!: (result: QspImportResponse) => void;
    vi.mocked(api.listStories).mockResolvedValue(storyPage([]));
    vi.mocked(api.importUnlimitedQsp).mockImplementation((_file, onUploadProgress) => {
      reportUploadProgress = onUploadProgress;
      return new Promise((resolve) => {
        finishImport = resolve;
      });
    });

    render(
      <MemoryRouter>
        <StoryList user={administrator} />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'No stories found' });
    await user.click(screen.getByRole('button', { name: 'Import a story' }));
    await user.selectOptions(screen.getByLabelText('Source format'), 'qsp');
    const source = new File([' '.repeat(81 * 1024)], 'large.qsps', {
      type: 'text/plain',
    });
    await user.upload(screen.getByLabelText('QSP game or location files'), source);

    expect(
      screen.getByText('Approximately 81 KiB · no Paralleax limit for administrators'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import story' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Import story' }));

    expect(api.importUnlimitedQsp).toHaveBeenCalledWith(
      {
        name: 'large.qsps',
        format: 'text',
        content: source,
      },
      expect.any(Function),
    );
    act(() => reportUploadProgress?.(42));
    expect(screen.getByText('Uploading the file… 42%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Uploading the file… 42%' })).toHaveAttribute(
      'aria-valuenow',
      '42',
    );

    act(() => reportUploadProgress?.(100));
    expect(
      screen.getByRole('progressbar', {
        name: 'File received. Analysing and creating the story…',
      }),
    ).not.toHaveAttribute('aria-valuenow');

    await act(async () => finishImport(importResult));
    expect(await screen.findByRole('heading', { name: 'QSP story imported' })).toBeInTheDocument();
    expect(api.importQsp).not.toHaveBeenCalled();
  });

  it('searches, filters by resolved capabilities and ownership, and switches layout', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listStories).mockImplementation(async (options) => {
      const items = structuredClone(stories)
        .filter((story) =>
          story.title.toLocaleLowerCase().includes(options?.query?.toLocaleLowerCase() ?? ''),
        )
        .filter((story) => {
          if (options?.filter === 'editable') return story.capabilities?.canEdit;
          if (options?.filter === 'commentable') return story.capabilities?.canComment;
          if (options?.filter === 'owned') return story.owner?.id === standardUser.id;
          return true;
        });
      return storyPage(items);
    });

    render(
      <MemoryRouter>
        <StoryList user={standardUser} />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'First story' });

    await user.type(screen.getByRole('searchbox', { name: 'Search stories' }), 'Second');
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'First story' })).not.toBeInTheDocument(),
    );
    expect(await screen.findByRole('heading', { name: 'Second story' })).toBeInTheDocument();

    await user.clear(screen.getByRole('searchbox', { name: 'Search stories' }));
    await user.click(screen.getByRole('button', { name: 'Editable by me' }));
    expect(await screen.findByRole('heading', { name: 'First story' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Second story' })).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Commentable by me' }));
    expect(await screen.findByRole('heading', { name: 'First story' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Second story' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Created by me' }));
    expect(await screen.findByRole('heading', { name: 'First story' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Second story' })).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows a distinct loading error and recovers on retry', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listStories)
      .mockRejectedValueOnce(new Error('API unavailable'))
      .mockResolvedValueOnce(storyPage([structuredClone(stories[0])]));

    render(
      <MemoryRouter>
        <StoryList user={standardUser} />
      </MemoryRouter>,
    );

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByRole('heading', { name: 'Stories could not be loaded' }),
    ).toBeVisible();
    expect(within(alert).getByText('API unavailable')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'No stories found' })).not.toBeInTheDocument();
    expect(screen.queryByText('0 stories')).not.toBeInTheDocument();

    await user.click(within(alert).getByRole('button', { name: 'Retry' }));

    expect(await screen.findByRole('heading', { name: 'First story' })).toBeVisible();
    expect(api.listStories).toHaveBeenCalledTimes(2);
  });

  it('prevents duplicate story creation while the first request is unresolved', async () => {
    const user = userEvent.setup();
    let finishCreation!: (story: Story) => void;
    const creation = new Promise<Story>((resolve) => {
      finishCreation = resolve;
    });
    vi.mocked(api.listStories).mockResolvedValue(storyPage([]));
    vi.mocked(api.createStory).mockReturnValue(creation);

    render(
      <MemoryRouter>
        <StoryList user={standardUser} />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'No stories found' });
    await user.click(screen.getByRole('button', { name: 'New story' }));
    await user.type(screen.getByLabelText('Story title'), 'Only once');
    const createButton = screen.getByRole('button', { name: 'Create story' });

    await user.dblClick(createButton);

    expect(api.createStory).toHaveBeenCalledOnce();
    screen.getByLabelText('Story title').focus();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Create a story' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();

    await act(async () =>
      finishCreation({
        id: 'story-created-once',
        title: 'Only once',
        createdAt: '2026-07-14T08:00:00.000Z',
        updatedAt: '2026-07-14T08:00:00.000Z',
        interactions: [],
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Only once' })).toBeVisible();
  });

  it('closes the creation dialog with Escape and restores its opening control', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listStories).mockResolvedValue(storyPage([]));

    render(
      <MemoryRouter>
        <StoryList user={standardUser} />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'No stories found' });
    const openingControl = screen.getByRole('button', { name: 'New story' });

    await user.click(openingControl);

    const title = screen.getByLabelText('Story title');
    expect(title).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Create a story' })).not.toBeInTheDocument();
    await waitFor(() => expect(openingControl).toHaveFocus());
  });

  it('focuses and closes the import dialog without losing its opening control', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listStories).mockResolvedValue(storyPage([]));

    render(
      <MemoryRouter>
        <StoryList user={standardUser} />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'No stories found' });
    const openingControl = screen.getByRole('button', { name: 'Import a story' });

    await user.click(openingControl);

    expect(screen.getByLabelText('ChoiceScript scene files')).toHaveFocus();
    await user.keyboard('{Escape}');

    expect(
      screen.queryByRole('dialog', { name: 'Import a ChoiceScript project' }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(openingControl).toHaveFocus());
  });

  it('keeps a non-cancellable import dialog open when Escape is pressed', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listStories).mockResolvedValue(storyPage([]));
    vi.mocked(api.importChoiceScript).mockReturnValue(new Promise(() => undefined));

    render(
      <MemoryRouter>
        <StoryList user={standardUser} />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'No stories found' });
    await user.click(screen.getByRole('button', { name: 'Import a story' }));
    const dialog = screen.getByRole('dialog', { name: 'Import a ChoiceScript project' });
    const fileInput = within(dialog).getByLabelText('ChoiceScript scene files');
    await user.upload(
      fileInput,
      new File(['*title Pending import'], 'startup.txt', { type: 'text/plain' }),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Import story' }));
    await waitFor(() => expect(api.importChoiceScript).toHaveBeenCalledOnce());
    fileInput.focus();
    await user.keyboard('{Escape}');

    expect(dialog).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Importing…' })).toBeDisabled();
  });

  it('keeps the creation form recoverable after a temporary failure', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listStories).mockResolvedValue(storyPage([]));
    vi.mocked(api.createStory)
      .mockRejectedValueOnce(new Error('Creation temporarily unavailable'))
      .mockResolvedValueOnce({
        id: 'story-recovered',
        title: 'Recovered story',
        createdAt: '2026-07-14T08:00:00.000Z',
        updatedAt: '2026-07-14T08:00:00.000Z',
        interactions: [],
      });

    render(
      <MemoryRouter>
        <StoryList user={standardUser} />
      </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'No stories found' });
    await user.click(screen.getByRole('button', { name: 'New story' }));
    await user.type(screen.getByLabelText('Story title'), 'Recovered story');
    await user.click(screen.getByRole('button', { name: 'Create story' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Creation temporarily unavailable');
    expect(screen.getByRole('dialog', { name: 'Create a story' })).toBeVisible();
    expect(screen.getByLabelText('Story title')).toHaveValue('Recovered story');

    await user.click(screen.getByRole('button', { name: 'Create story' }));

    expect(await screen.findByRole('heading', { name: 'Recovered story' })).toBeVisible();
    expect(api.createStory).toHaveBeenCalledTimes(2);
  });

  it('retries a failed next page without losing or duplicating loaded stories', async () => {
    const user = userEvent.setup();
    vi.mocked(api.listStories)
      .mockResolvedValueOnce(
        storyPage([structuredClone(stories[0])], { totalCount: 2, hasMore: true }),
      )
      .mockRejectedValueOnce(new Error('Next page unavailable'))
      .mockResolvedValueOnce(
        storyPage(structuredClone(stories), { page: 2, totalCount: 2, hasMore: false }),
      );

    render(
      <MemoryRouter>
        <StoryList user={standardUser} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'First story' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Load more stories' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Next page unavailable');
    expect(screen.getByRole('heading', { name: 'First story' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Load more stories' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Load more stories' }));

    expect(await screen.findByRole('heading', { name: 'Second story' })).toBeVisible();
    expect(screen.getAllByRole('heading', { name: 'First story' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Load more stories' })).not.toBeInTheDocument();
    expect(api.listStories).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ page: 2, pageSize: 24 }),
    );
    expect(api.listStories).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ page: 2, pageSize: 24 }),
    );
  });

  it('only shows actions allowed by resolved story capabilities', async () => {
    vi.mocked(api.listStories).mockResolvedValue(
      storyPage([
        {
          ...stories[0],
          access: { visibility: 'public', editPolicy: 'owner', commentPolicy: 'editors' },
          capabilities: { canRead: true, canEdit: false, canManage: false, canComment: false },
        },
      ]),
    );

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
    vi.mocked(api.listStories).mockResolvedValue(
      storyPage([
        {
          ...stories[0],
          access: { visibility: 'authenticated', editPolicy: 'owner', commentPolicy: 'readers' },
          capabilities: { canRead: true, canEdit: false, canManage: false, canComment: true },
        },
      ]),
    );

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
    vi.mocked(api.listStories).mockResolvedValue(storyPage([structuredClone(stories[0])]));

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

function storyPage(
  items: StorySummary[],
  overrides: Partial<{
    page: number;
    pageSize: number;
    totalCount: number;
    hasMore: boolean;
  }> = {},
) {
  return {
    items,
    page: 1,
    pageSize: 24,
    totalCount: items.length,
    hasMore: false,
    ...overrides,
  };
}
