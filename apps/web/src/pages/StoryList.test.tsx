import { requireValue } from '../test/assertions';
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { QspImportReport, Story, StorySummary } from '@paralleax/shared';
import { StoryList } from './StoryList';
import { api, type AuthUser, type QspImportResponse } from '../api';
import { loadStoryEditor, loadStoryPlayer } from './storyRouteLoaders';
import { changeInterfaceLanguage } from '../i18n';

vi.mock('../api', () => ({
  api: {
    listStories: vi.fn(),
    listPublicStories: vi.fn(),
    createStory: vi.fn(),
    createDemoStories: vi.fn(),
    importChoiceScript: vi.fn(),
    importReportUrl: vi.fn((importId: string) => `/api/imports/${importId}/report`),
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

function StoryEditorRouteProbe() {
  const location = useLocation();
  const destination = `${location.pathname}${location.search}`;
  return <h1>Story editor {destination}</h1>;
}

class FakeEventSource {
  static readonly instances: FakeEventSource[] = [];

  readonly listeners = new Map<string, Set<EventListener>>();
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
    queueMicrotask(() => {
      this.emit('ready');
    });
  }

  addEventListener(type: string, listener: EventListener) {
    const listeners = this.listeners.get(type) ?? new Set<EventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  close() {
    this.closed = true;
  }

  emit(type: string, data = '') {
    const event = new MessageEvent(type, { data });
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }
}

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

function importedStorySummary(story: Story): StorySummary {
  return {
    id: story.id,
    title: story.title,
    interactionCount: story.interactions.length,
    access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
    capabilities: { canRead: true, canEdit: true, canManage: true, canComment: true },
    createdAt: story.createdAt,
    updatedAt: story.updatedAt,
  };
}

function importedStoryFixture({
  id,
  title,
  interactionId,
  interactionTitle,
  body,
  date,
}: {
  id: string;
  title: string;
  interactionId: string;
  interactionTitle: string;
  body: string;
  date: string;
}): Story {
  return {
    id,
    title,
    createdAt: date,
    updatedAt: date,
    interactions: [
      {
        id: interactionId,
        title: interactionTitle,
        body,
        position: { x: 80, y: 120 },
        triggers: [{ id: `trigger-${interactionId}`, inputInteractionIds: [], conditions: [] }],
      },
    ],
  };
}

function qspImportReport(overrides: Partial<QspImportReport> = {}): QspImportReport {
  return {
    format: 'qsp',
    warningCount: 0,
    errorCount: 0,
    sourceFileCount: 1,
    locationCount: 1,
    actionCount: 0,
    interactionCount: 1,
    convertedStatementCount: 0,
    approximatedStatementCount: 0,
    unsupportedStatementCount: 0,
    coverage: [],
    issues: [],
    ...overrides,
  };
}

function renderEmptyStoryList(user: AuthUser = standardUser) {
  vi.mocked(api.listStories).mockResolvedValue(storyPage([]));
  render(
    <MemoryRouter>
      <StoryList user={user} />
    </MemoryRouter>,
  );
}

async function openEmptyStoryImport(
  user: ReturnType<typeof userEvent.setup>,
  format: 'choicescript' | 'qsp' = 'choicescript',
  storyUser: AuthUser = standardUser,
) {
  renderEmptyStoryList(storyUser);
  await screen.findByRole('heading', { name: 'No stories found' });
  await user.click(screen.getByRole('button', { name: 'Import a story' }));
  if (format === 'qsp') {
    await screen.findByLabelText('Source format');
    await user.selectOptions(screen.getByLabelText('Source format'), 'qsp');
    return screen.getByLabelText('QSP game or location files');
  }
  return screen.findByLabelText('ChoiceScript scene files');
}

function filterStorySummaries(options?: { query?: string; filter?: string }) {
  const items = structuredClone(stories)
    .filter((story) =>
      story.title.toLocaleLowerCase().includes(options?.query?.toLocaleLowerCase() ?? ''),
    )
    .filter((story) => {
      if (options?.filter === 'editable') {
        return story.capabilities?.canEdit === true;
      }
      if (options?.filter === 'commentable') {
        return story.capabilities?.canComment === true;
      }
      if (options?.filter === 'owned') {
        return story.owner?.id === standardUser.id;
      }
      return true;
    });
  return storyPage(items);
}

function storyWithOpeningPath(): Story {
  return {
    id: 'story-3',
    title: 'New story',
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    interactions: [
      {
        id: 'story-3-root',
        title: 'Start',
        body: '',
        position: { x: 80, y: 120 },
        triggers: [{ id: 'story-3-root-trigger', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'story-3-child',
        title: 'New interaction',
        body: '',
        position: { x: 80, y: 252 },
        triggers: [
          {
            id: 'story-3-child-trigger',
            inputInteractionIds: ['story-3-root'],
            conditions: [],
          },
        ],
      },
    ],
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.resetAllMocks();
  FakeEventSource.instances.length = 0;
  vi.stubGlobal('EventSource', FakeEventSource);
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
  const firstCard = requireValue(
    screen.getByRole('heading', { name: 'First story' }).closest('article'),
    'first story card',
  );
  expect(within(firstCard).queryByRole('img')).not.toBeInTheDocument();
  expect(firstCard.querySelector('dl')).toBeNull();
  expect(within(firstCard).queryByText('Interactions')).not.toBeInTheDocument();
  expect(within(firstCard).getByRole('link', { name: 'Edit' })).toHaveAttribute(
    'href',
    '/stories/story-1/edit',
  );
  expect(within(firstCard).getByRole('link', { name: 'Edit' })).toHaveClass('product-primary');
  expect(within(firstCard).getByRole('link', { name: 'Read' })).toHaveClass('product-secondary');
  expect(within(firstCard).getByRole('link', { name: 'Read' })).toHaveAttribute(
    'href',
    '/stories/story-1/play',
  );
  expect(within(firstCard).getByRole('link', { name: 'Access' })).toHaveAttribute(
    'href',
    '/stories/story-1/edit?settings=access',
  );
  expect(screen.getByRole('button', { name: 'New story' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Generate demos' })).not.toBeInTheDocument();

  const editLink = within(firstCard).getByRole('link', { name: 'Edit' });
  const readLink = within(firstCard).getByRole('link', { name: 'Read' });
  await user.hover(editLink);
  expect(loadStoryEditor).toHaveBeenCalled();
  const editorPreloads = vi.mocked(loadStoryEditor).mock.calls.length;
  fireEvent.focus(editLink);
  expect(loadStoryEditor).toHaveBeenCalledTimes(editorPreloads + 1);
  await user.hover(readLink);
  expect(loadStoryPlayer).toHaveBeenCalled();
  const playerPreloads = vi.mocked(loadStoryPlayer).mock.calls.length;
  fireEvent.focus(readLink);
  expect(loadStoryPlayer).toHaveBeenCalledTimes(playerPreloads + 1);
});

it('shows library actions as icons with focus tooltips', async () => {
  vi.mocked(api.listStories).mockResolvedValue(storyPage(structuredClone(stories)));
  render(
    <MemoryRouter>
      <StoryList user={standardUser} />
    </MemoryRouter>,
  );
  const firstCard = requireValue(
    (await screen.findByRole('heading', { name: 'First story' })).closest('article'),
    'first story card',
  );
  const accessLink = within(firstCard).getByRole('link', { name: 'Access' });
  expect(accessLink).toHaveTextContent('');
  fireEvent.focus(accessLink);
  expect(document.getElementById(accessLink.getAttribute('aria-describedby') ?? '')).toHaveClass(
    'is-visible',
  );
});

it('offers native export only for editable stories', async () => {
  vi.mocked(api.listStories).mockResolvedValue(storyPage(structuredClone(stories)));
  render(
    <MemoryRouter>
      <StoryList user={standardUser} />
    </MemoryRouter>,
  );
  const editable = (await screen.findByRole('heading', { name: 'First story' })).closest('article');
  const readerOnly = screen.getByRole('heading', { name: 'Second story' }).closest('article');
  if (!editable || !readerOnly) {
    throw new Error('Missing Story cards');
  }
  expect(within(editable).getByRole('link', { name: 'Export' })).toHaveAttribute(
    'href',
    '/api/stories/story-1/export',
  );
  expect(within(readerOnly).queryByRole('link', { name: 'Export' })).not.toBeInTheDocument();
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

  const card = requireValue(
    (await screen.findByRole('heading', { name: 'First story' })).closest('article'),
    'first story card',
  );
  expect(screen.getByRole('heading', { name: 'Stories' })).toBeInTheDocument();
  expect(api.listPublicStories).toHaveBeenCalledOnce();
  expect(api.listStories).not.toHaveBeenCalled();
  expect(within(card).getByRole('link', { name: 'Read' })).toBeInTheDocument();
  expect(within(card).getByRole('link', { name: 'Read' })).toHaveClass('product-primary');
  expect(within(card).queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  expect(within(card).queryByRole('link', { name: 'Access' })).not.toBeInTheDocument();
  expect(within(card).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'New story' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Generate demos' })).not.toBeInTheDocument();
});

it('opens a newly created story in the editor', async () => {
  const user = userEvent.setup();
  vi.mocked(api.listStories).mockResolvedValue(storyPage([structuredClone(stories[0])]));
  vi.mocked(api.createStory).mockResolvedValue(storyWithOpeningPath());
  const onStoryCreated = vi.fn();

  render(
    <MemoryRouter>
      <Routes>
        <Route
          path="/"
          element={<StoryList user={standardUser} onStoryCreated={onStoryCreated} />}
        />
        <Route path="/stories/story-3/edit" element={<StoryEditorRouteProbe />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'First story' });

  await user.click(screen.getByRole('button', { name: 'New story' }));
  await user.type(screen.getByLabelText('Story title'), 'New story');
  await user.click(screen.getByRole('button', { name: 'Create story' }));
  expect(
    await screen.findByRole('heading', {
      name: 'Story editor /stories/story-3/edit?focusInteractionId=story-3-root',
    }),
  ).toBeInTheDocument();
  expect(api.createStory).toHaveBeenCalledWith('New story');
  expect(onStoryCreated).toHaveBeenCalledWith('story-3');
});

async function openDeleteDialog(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('heading', { name: 'First story' });
  const firstCard = requireValue(
    screen.getByRole('heading', { name: 'First story' }).closest('article'),
    'first story card',
  );
  const deleteButton = within(firstCard).getByRole('button', { name: 'Delete' });
  fireEvent.focus(deleteButton);
  expect(deleteButton).toHaveAttribute('aria-describedby');
  expect(document.getElementById(deleteButton.getAttribute('aria-describedby') ?? '')).toHaveClass(
    'is-visible',
  );
  await user.click(deleteButton);
  const dialog = await screen.findByRole('dialog', { name: 'Delete this story?' });
  expect(dialog).toHaveAccessibleDescription('Delete “First story”? This cannot be undone.');
  return { deleteButton, dialog };
}

function renderStoryList() {
  render(
    <MemoryRouter>
      <StoryList user={standardUser} />
    </MemoryRouter>,
  );
}

it('story deletion: focuses Cancel and leaves the story untouched on cancel or Escape', async () => {
  const user = userEvent.setup();
  vi.mocked(api.listStories).mockResolvedValue(storyPage([structuredClone(stories[0])]));
  renderStoryList();
  const { deleteButton, dialog } = await openDeleteDialog(user);
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(deleteButton);
  await user.click(
    within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(api.deleteStory).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'First story' })).toBeInTheDocument();
});

it('story deletion: deletes once and removes the card only after success', async () => {
  const user = userEvent.setup();
  vi.mocked(api.listStories)
    .mockResolvedValueOnce(storyPage([structuredClone(stories[0])]))
    .mockResolvedValueOnce(storyPage([]));
  let finish: () => void = () => undefined;
  vi.mocked(api.deleteStory).mockReturnValue(
    new Promise<undefined>((resolve) => {
      finish = () => {
        resolve(undefined);
      };
    }),
  );
  renderStoryList();
  const { dialog } = await openDeleteDialog(user);

  const confirm = within(dialog).getByRole('button', { name: 'Delete' });
  await user.click(confirm);
  await user.click(confirm);
  expect(confirm).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
  await user.keyboard('{Escape}');
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'First story' })).toBeInTheDocument();

  finish();
  await waitFor(() => {
    expect(screen.queryByRole('heading', { name: 'First story' })).not.toBeInTheDocument();
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(api.deleteStory).toHaveBeenCalledTimes(1);
  expect(api.deleteStory).toHaveBeenCalledWith('story-1');
  expect(api.listStories).toHaveBeenCalledTimes(2);
});

it('story deletion: stays open with an error after a failure and allows a retry', async () => {
  const user = userEvent.setup();
  vi.mocked(api.listStories)
    .mockResolvedValueOnce(storyPage([structuredClone(stories[0])]))
    .mockResolvedValueOnce(storyPage([]));
  vi.mocked(api.deleteStory)
    .mockRejectedValueOnce(new Error('network down'))
    .mockResolvedValueOnce(undefined);
  renderStoryList();
  const { dialog } = await openDeleteDialog(user);

  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
  expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'First story' })).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeEnabled();

  await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
  await waitFor(() => {
    expect(screen.queryByRole('heading', { name: 'First story' })).not.toBeInTheDocument();
  });
  expect(api.deleteStory).toHaveBeenCalledTimes(2);
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

  await screen.findByRole('heading', { name: 'Demo 1: paths only' });
  expect(
    await screen.findByRole('heading', { name: 'Demo 2: visited interaction conditions' }),
  ).toBeInTheDocument();
  expect(api.createDemoStories).toHaveBeenCalledOnce();
});

it('imports ChoiceScript scene files with a clean compatibility report', async () => {
  const user = userEvent.setup();
  const importedStory = importedStoryFixture({
    id: 'story-imported',
    title: 'Imported story',
    interactionId: 'interaction-imported',
    interactionTitle: 'Startup',
    body: '<p>Imported prose.</p>',
    date: '2026-08-22T08:00:00.000Z',
  });
  mockCleanChoiceScriptImport(importedStory);
  const input = await openEmptyStoryImport(user);
  const startup = new File(['*title Imported story\n*set score 1\nStart.'], 'startup.txt', {
    type: 'text/plain',
  });
  const ending = new File(['The end.\n*ending'], 'ending.txt', { type: 'text/plain' });
  await user.upload(input, [startup, ending]);
  expect(screen.getByText('2 files selected')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Import story' }));

  expect(
    await screen.findByRole('heading', { name: 'ChoiceScript story imported' }),
  ).toBeInTheDocument();
  expect(api.importChoiceScript).toHaveBeenCalledWith(
    [
      { name: 'startup.txt', content: '*title Imported story\n*set score 1\nStart.' },
      { name: 'ending.txt', content: 'The end.\n*ending' },
    ],
    false,
    expect.any(AbortSignal),
  );
  expect(screen.getByText('No compatibility warning was reported for this import.')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Open in editor' })).toHaveAttribute(
    'href',
    '/stories/story-imported/edit',
  );
  const importedCard = requireValue(
    screen.getByRole('heading', { name: 'Imported story' }).closest('article'),
    'imported story card',
  );
  expect(within(importedCard).queryByText('Interactions')).not.toBeInTheDocument();
});

it('imports a QSP game and displays the compatibility coverage matrix', async () => {
  const user = userEvent.setup();
  const importedStory = importedStoryFixture({
    id: 'story-qsp',
    title: 'QSP story',
    interactionId: 'interaction-start',
    interactionTitle: 'Start',
    body: '<p>Start.</p>',
    date: '2026-09-02T08:00:00.000Z',
  });
  mockQspConfirmationAndImport(importedStory);
  await openEmptyStoryImport(user, 'qsp');
  const source = "# Start\n*pl 'Start.'\n---";
  await user.upload(
    screen.getByLabelText('QSP game or location files'),
    new File([source], 'sample.qsps', { type: 'text/plain' }),
  );
  await user.click(screen.getByRole('button', { name: 'Import story' }));

  expect(
    await screen.findByRole('heading', { name: 'Review the import report' }),
  ).toBeInTheDocument();
  expect(screen.getByText('101')).toBeInTheDocument();
  expect(
    screen.queryByText('Automatic navigation was converted into an explicit choice.'),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Download preview' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /Show more issues/ })).not.toBeInTheDocument();
  expect(screen.getByText('QSP compatibility coverage')).toBeInTheDocument();
  expect(screen.getByText('Variables, arrays, and expressions')).toBeInTheDocument();
  expect(screen.getByText('Partial')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'QSP story' })).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Confirm import' }));

  expect(await screen.findByRole('heading', { name: 'QSP story imported' })).toBeInTheDocument();
  expect(api.importQsp).toHaveBeenNthCalledWith(
    1,
    { name: 'sample.qsps', format: 'text', contentBase64: btoa(source) },
    false,
    expect.any(String),
    expect.objectContaining({ aborted: false }),
  );
  expect(api.importQsp).toHaveBeenNthCalledWith(
    2,
    { name: 'sample.qsps', format: 'text', contentBase64: btoa(source) },
    true,
    expect.any(String),
    expect.objectContaining({ aborted: false }),
  );
  expect(screen.getByRole('heading', { name: 'QSP story' })).toBeInTheDocument();
});

function mockCleanChoiceScriptImport(story: Story) {
  vi.mocked(api.importChoiceScript).mockResolvedValue({
    status: 'imported',
    importId: '00000000-0000-4000-8000-000000000002',
    story: importedStorySummary(story),
    report: {
      format: 'choicescript',
      warningCount: 0,
      errorCount: 0,
      sourceFileCount: 2,
      sceneCount: 2,
      interactionCount: 1,
      convertedCommandCount: 2,
      approximatedCommandCount: 0,
      ignoredCommandCount: 0,
      issues: [],
    },
  });
}

function mockQspConfirmationAndImport(story: Story) {
  const report = qspImportReport({
    warningCount: 101,
    sourceFileCount: 1,
    locationCount: 1,
    interactionCount: 1,
    convertedStatementCount: 1,
    approximatedStatementCount: 1,
    coverage: [
      { feature: 'locations' as const, support: 'supported' as const, occurrences: 1 },
      { feature: 'variables' as const, support: 'partial' as const, occurrences: 0 },
    ],
  });
  vi.mocked(api.importQsp)
    .mockResolvedValueOnce({
      status: 'confirmation_required',
      importId: '00000000-0000-4000-8000-000000000003',
      report,
    })
    .mockResolvedValueOnce({
      status: 'imported',
      importId: '00000000-0000-4000-8000-000000000004',
      story: importedStorySummary(story),
      report,
    });
}

it('displays streamed QSP analysis progress while the import is running', async () => {
  const user = userEvent.setup();
  let finishImport!: (result: QspImportResponse) => void;
  vi.mocked(api.listStories).mockResolvedValue(storyPage([]));
  vi.mocked(api.importQsp).mockImplementation(
    () =>
      new Promise<QspImportResponse>((resolve) => {
        finishImport = resolve;
      }),
  );

  render(
    <MemoryRouter>
      <StoryList user={standardUser} />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'No stories found' });
  await user.click(screen.getByRole('button', { name: 'Import a story' }));
  await screen.findByLabelText('Source format');
  await user.selectOptions(screen.getByLabelText('Source format'), 'qsp');
  await user.upload(
    screen.getByLabelText('QSP game or location files'),
    new File(["# Start\n'Hello'\n--- Start ---"], 'progress.qsps', { type: 'text/plain' }),
  );
  await user.click(screen.getByRole('button', { name: 'Import story' }));
  await waitFor(() => {
    expect(api.importQsp).toHaveBeenCalledOnce();
  });

  act(() => {
    FakeEventSource.instances[0].emit(
      'progress',
      JSON.stringify({
        phase: 'parsing',
        completed: 12,
        total: 42,
        currentFile: 'locations/room.qsrc',
      }),
    );
  });

  expect(screen.getByText(/Parsing QSP locations/)).toBeVisible();
  expect(screen.getByText('Current file: locations/room.qsrc')).toBeVisible();
  expect(screen.getByRole('progressbar', { name: /Parsing QSP locations/ })).toHaveAttribute(
    'aria-valuenow',
    '12',
  );
  expect(screen.getByRole('progressbar', { name: /Parsing QSP locations/ })).toHaveAttribute(
    'aria-valuemax',
    '42',
  );

  await act(async () => {
    finishImport({
      status: 'confirmation_required',
      importId: '00000000-0000-4000-8000-000000000005',
      report: {
        format: 'qsp',
        warningCount: 0,
        errorCount: 0,
        sourceFileCount: 1,
        locationCount: 1,
        actionCount: 0,
        interactionCount: 1,
        convertedStatementCount: 0,
        approximatedStatementCount: 0,
        unsupportedStatementCount: 0,
        coverage: [],
        issues: [],
      },
    });
  });

  expect(await screen.findByRole('heading', { name: 'Review the import report' })).toBeVisible();
  expect(FakeEventSource.instances[0].closed).toBe(true);
});

it('displays the QSP conversion error report returned by the API', async () => {
  const user = userEvent.setup();
  vi.mocked(api.listStories).mockResolvedValue(storyPage([]));
  vi.mocked(api.importQsp).mockRejectedValue(
    Object.assign(new Error('QSP import failed'), {
      status: 400,
      code: 'STORY_IMPORT_FAILED',
      details: {
        importId: '00000000-0000-4000-8000-000000000008',
        report: {
          format: 'qsp',
          warningCount: 0,
          errorCount: 2,
          sourceFileCount: 1,
          locationCount: 0,
          actionCount: 0,
          interactionCount: 0,
          convertedStatementCount: 0,
          approximatedStatementCount: 0,
          unsupportedStatementCount: 0,
          coverage: [],
          issues: [],
        },
      },
    }),
  );

  render(
    <MemoryRouter>
      <StoryList user={standardUser} />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'No stories found' });
  await user.click(screen.getByRole('button', { name: 'Import a story' }));
  await screen.findByLabelText('Source format');
  await user.selectOptions(screen.getByLabelText('Source format'), 'qsp');
  await user.upload(
    screen.getByLabelText('QSP game or location files'),
    new File(["# Start\n*pl 'unterminated\n---"], 'broken.qsps', { type: 'text/plain' }),
  );
  await user.click(screen.getByRole('button', { name: 'Import story' }));

  const alert = await screen.findByRole('alert');
  expect(within(alert).getByText('The source could not be converted into a story.')).toBeVisible();
  const errorReport = requireValue(
    screen
      .getByRole('button', { name: 'Download preview' })
      .closest<HTMLElement>('.choicescript-import-result'),
    'import error report',
  );
  expect(within(errorReport).getByText('2')).toBeVisible();
  expect(
    within(errorReport).queryByText('The QSP statement is malformed.'),
  ).not.toBeInTheDocument();
  expect(within(errorReport).getByRole('button', { name: 'Download preview' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Confirm import' })).not.toBeInTheDocument();
});

it('downloads the report after a Story save failure', async () => {
  const user = userEvent.setup();
  vi.mocked(api.listStories).mockResolvedValue(storyPage([]));
  vi.mocked(api.importChoiceScript).mockRejectedValue(
    Object.assign(new Error('The converted Story could not be saved.'), {
      status: 500,
      code: 'STORY_IMPORT_SAVE_FAILED',
      details: {
        importId: '00000000-0000-4000-8000-000000000009',
        report: {
          format: 'choicescript',
          warningCount: 2,
          errorCount: 0,
          sceneCount: 1,
          interactionCount: 1,
          issues: [],
        },
      },
    }),
  );

  render(
    <MemoryRouter>
      <StoryList user={standardUser} />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'No stories found' });
  await user.click(screen.getByRole('button', { name: 'Import a story' }));
  await user.upload(
    await screen.findByLabelText('ChoiceScript scene files'),
    new File(['A chapter begins.'], 'startup.txt', { type: 'text/plain' }),
  );
  await user.click(screen.getByRole('button', { name: 'Import story' }));

  expect(await screen.findByRole('button', { name: 'Download preview' })).toBeVisible();
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
    status: 'imported',
    importId: '00000000-0000-4000-8000-000000000006',
    story: importedStorySummary(importedStory),
    report: {
      format: 'qsp',
      warningCount: 0,
      errorCount: 0,
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
  await screen.findByLabelText('Source format');
  await user.selectOptions(screen.getByLabelText('Source format'), 'qsp');
  await user.upload(screen.getByLabelText('QSP game or location files'), [
    new File(['# start\n--- start ---'], 'start.qsrc', { type: 'text/plain' }),
    new File(['# room\n--- room ---'], 'room.qsrc', { type: 'text/plain' }),
  ]);
  await user.click(screen.getByRole('button', { name: 'Import story' }));

  await waitFor(() => {
    expect(api.importQsp).toHaveBeenCalledTimes(1);
  });
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
    status: 'imported',
    importId: '00000000-0000-4000-8000-000000000007',
    story: importedStorySummary(importedStory),
    report: {
      format: 'qsp' as const,
      warningCount: 0,
      errorCount: 0,
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
  await screen.findByLabelText('Source format');
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
    false,
    expect.any(String),
    expect.objectContaining({ aborted: false }),
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

  await act(async () => {
    finishImport(importResult);
  });
  expect(await screen.findByRole('heading', { name: 'QSP story imported' })).toBeInTheDocument();
  expect(api.importQsp).not.toHaveBeenCalled();
});

it('searches, filters by resolved capabilities and ownership, and switches layout', async () => {
  const user = userEvent.setup();
  vi.mocked(api.listStories).mockImplementation(async (options) => filterStorySummaries(options));

  render(
    <MemoryRouter>
      <StoryList user={standardUser} />
    </MemoryRouter>,
  );
  await screen.findByRole('heading', { name: 'First story' });

  await user.type(screen.getByRole('searchbox', { name: 'Search stories' }), 'Second');
  await waitFor(() => {
    expect(screen.queryByRole('heading', { name: 'First story' })).not.toBeInTheDocument();
  });
  expect(await screen.findByRole('heading', { name: 'Second story' })).toBeInTheDocument();

  await user.clear(screen.getByRole('searchbox', { name: 'Search stories' }));
  await user.click(screen.getByRole('button', { name: 'Editable by me' }));
  expect(await screen.findByRole('heading', { name: 'First story' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.queryByRole('heading', { name: 'Second story' })).not.toBeInTheDocument();
  });

  await user.click(screen.getByRole('button', { name: 'Commentable by me' }));
  expect(await screen.findByRole('heading', { name: 'First story' })).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: 'Second story' })).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Created by me' }));
  expect(await screen.findByRole('heading', { name: 'First story' })).toBeInTheDocument();
  await waitFor(() => {
    expect(screen.queryByRole('heading', { name: 'Second story' })).not.toBeInTheDocument();
  });

  await user.click(screen.getByRole('button', { name: 'List view' }));
  expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true');
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
  expect(within(alert).getByRole('heading', { name: 'Stories could not be loaded' })).toBeVisible();
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
      <Routes>
        <Route path="/" element={<StoryList user={standardUser} />} />
        <Route path="/stories/story-created-once/edit" element={<h1>Story editor</h1>} />
      </Routes>
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

  await act(async () => {
    finishCreation({
      id: 'story-created-once',
      title: 'Only once',
      createdAt: '2026-07-14T08:00:00.000Z',
      updatedAt: '2026-07-14T08:00:00.000Z',
      interactions: [],
    });
  });
  expect(await screen.findByRole('heading', { name: 'Story editor' })).toBeVisible();
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
  await waitFor(() => {
    expect(openingControl).toHaveFocus();
  });
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

  expect(await screen.findByLabelText('ChoiceScript scene files')).toHaveFocus();
  await user.keyboard('{Escape}');

  expect(
    screen.queryByRole('dialog', { name: 'Import a ChoiceScript project' }),
  ).not.toBeInTheDocument();
  await waitFor(() => {
    expect(openingControl).toHaveFocus();
  });
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
  const dialog = await screen.findByRole('dialog', { name: 'Import a ChoiceScript project' });
  const fileInput = within(dialog).getByLabelText('ChoiceScript scene files');
  await user.upload(
    fileInput,
    new File(['*title Pending import'], 'startup.txt', { type: 'text/plain' }),
  );

  await user.click(within(dialog).getByRole('button', { name: 'Import story' }));
  await waitFor(() => {
    expect(api.importChoiceScript).toHaveBeenCalledOnce();
  });
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
      <Routes>
        <Route path="/" element={<StoryList user={standardUser} />} />
        <Route path="/stories/story-recovered/edit" element={<h1>Story editor</h1>} />
      </Routes>
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

  expect(await screen.findByRole('heading', { name: 'Story editor' })).toBeVisible();
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
  const card = requireValue(
    (await screen.findByRole('heading', { name: 'First story' })).closest('article'),
    'first story card',
  );
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
  const card = requireValue(
    (await screen.findByRole('heading', { name: 'First story' })).closest('article'),
    'first story card',
  );
  expect(within(card).getByRole('link', { name: 'Read' })).toHaveAttribute(
    'href',
    '/stories/story-1/play',
  );
  expect(within(card).queryByRole('link', { name: 'Edit' })).not.toBeInTheDocument();
  expect(within(card).queryByRole('link', { name: 'Review' })).not.toBeInTheDocument();
});

it('translates product copy without changing authored story titles', async () => {
  await changeInterfaceLanguage('fr');
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

it('allows retrying an import after a request failure', async () => {
  const user = userEvent.setup();
  vi.mocked(api.importChoiceScript)
    .mockRejectedValueOnce(new Error('Network unavailable'))
    .mockResolvedValueOnce({
      status: 'confirmation_required',
      importId: 'retry',
      report: {
        format: 'choicescript',
        sourceFileCount: 1,
        sceneCount: 1,
        interactionCount: 1,
        convertedCommandCount: 0,
        approximatedCommandCount: 1,
        ignoredCommandCount: 0,
        warningCount: 1,
        errorCount: 0,
        issues: [{ severity: 'warning', code: 'approximation', message: 'Example warning' }],
      },
    });
  await openEmptyStoryImport(user, 'choicescript');
  await user.upload(
    screen.getByLabelText('ChoiceScript scene files'),
    new File(['*finish'], 'startup.txt'),
  );
  await user.click(screen.getByRole('button', { name: 'Import story' }));
  expect(await screen.findByRole('alert')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Import story' }));
  expect(await screen.findByRole('heading', { name: 'Review the import report' })).toBeVisible();
  expect(screen.getByText('Warning: Example warning')).toBeVisible();
  expect(api.importChoiceScript).toHaveBeenCalledTimes(2);
});

it('aborts a pending import when the dialog is cancelled', async () => {
  const user = userEvent.setup();
  let activeSignal: AbortSignal | undefined;
  vi.mocked(api.importChoiceScript).mockImplementation((_files, _confirm, signal) => {
    activeSignal = signal;
    return new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
        reject(new DOMException('Cancelled', 'AbortError'));
      });
    });
  });
  await openEmptyStoryImport(user, 'choicescript');
  await user.upload(
    screen.getByLabelText('ChoiceScript scene files'),
    new File(['*finish'], 'startup.txt'),
  );
  await user.click(screen.getByRole('button', { name: 'Import story' }));
  await waitFor(() => {
    expect(activeSignal).toBeDefined();
  });
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(activeSignal?.aborted).toBe(true);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
