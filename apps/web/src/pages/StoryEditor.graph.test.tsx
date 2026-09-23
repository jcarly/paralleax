import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { updateGraphDecorationInStory, type StoryCommentThread } from '@paralleax/shared';
import { getInteractionDragTriggerPositionUpdates } from '../storyGraph';
import { computeStoryGraphLayout } from '../storyGraphLayout';
import {
  api,
  cloneStory,
  FakeEventSource,
  graphDecorationMutation,
  interactionMutation,
  renderEditor,
  setupStoryEditorTestSuite,
  storyWithThreeInteractions,
  storyWithTwoInteractions,
} from '../test/storyEditorTestHarness';

vi.mock('../api', async () => {
  const { createStoryApiMock } = await import('../test/mockStoryApi');
  return { api: createStoryApiMock() };
});

vi.mock('@xyflow/react', async () => {
  const { createReactFlowMock } = await import('../test/reactFlowMock');
  return createReactFlowMock();
});

describe('StoryEditor graph collaboration and layout', () => {
  setupStoryEditorTestSuite();

  it('opens the global comment list in the inspector and navigates to a contextual thread', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const thread: StoryCommentThread = {
      id: 'thread-interaction-2',
      storyId: story.id,
      anchor: { kind: 'entity', targetType: 'interaction', targetId: 'interaction-2' },
      anchorLabel: 'Second interaction',
      status: 'open',
      createdBy: { id: 'user-1', displayName: 'Author' },
      createdAt: '2026-08-16T09:00:00.000Z',
      updatedAt: '2026-08-16T09:00:00.000Z',
      messages: [
        {
          id: 'message-1',
          threadId: 'thread-interaction-2',
          author: { id: 'user-1', displayName: 'Author' },
          body: 'Should this choice be clearer?',
          createdAt: '2026-08-16T09:00:00.000Z',
        },
      ],
    };
    vi.mocked(api.listCommentThreads).mockResolvedValue([thread]);

    await renderEditor(story);
    await user.click(await screen.findByRole('button', { name: /^Comments/ }));

    const commentList = screen.getByRole('complementary', { name: 'Story comments' });
    expect(commentList).toHaveClass('inspector-placement');
    await user.click(within(commentList).getByRole('button', { name: /Second interaction/ }));

    expect(await screen.findByDisplayValue('Second interaction')).toBeInTheDocument();
    expect(
      screen.getByRole('complementary', { name: 'Comments for the selected element' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Should this choice be clearer?')).toBeInTheDocument();
    expect(
      screen.getByTestId('flow-node-interaction-2').querySelector('.interaction-node'),
    ).toHaveClass('selected');
  });

  it('persists an authorized canvas post-it move through its existing anchor', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const thread: StoryCommentThread = {
      id: 'thread-canvas',
      storyId: story.id,
      anchor: { kind: 'canvas', position: { x: 120, y: 180 } },
      anchorLabel: 'Story graph',
      status: 'open',
      createdBy: { id: 'user-1', displayName: 'Author' },
      createdAt: '2026-08-16T09:00:00.000Z',
      updatedAt: '2026-08-16T09:00:00.000Z',
      messages: [
        {
          id: 'message-canvas',
          threadId: 'thread-canvas',
          author: { id: 'user-1', displayName: 'Author' },
          body: 'Move this note.',
          createdAt: '2026-08-16T09:00:00.000Z',
        },
      ],
    };
    vi.mocked(api.listCommentThreads).mockResolvedValue([thread]);
    vi.mocked(api.updateCommentThreadAnchor).mockImplementation(
      async (_storyId, _threadId, anchor) => ({ ...thread, anchor }),
    );

    await renderEditor(story);
    await screen.findByTestId('flow-node-comment:thread-canvas');
    await user.click(screen.getByTestId('drag-node-comment:thread-canvas'));

    await waitFor(() =>
      expect(api.updateCommentThreadAnchor).toHaveBeenCalledWith('story-1', 'thread-canvas', {
        kind: 'canvas',
        position: { x: 145, y: 195 },
      }),
    );
  });

  it('reports a failed canvas post-it move without keeping an unpersisted position', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const thread: StoryCommentThread = {
      id: 'thread-failed-canvas',
      storyId: story.id,
      anchor: { kind: 'canvas', position: { x: 80, y: 90 } },
      anchorLabel: 'Story graph',
      status: 'open',
      createdBy: { id: 'user-1', displayName: 'Author' },
      createdAt: '2026-08-16T09:00:00.000Z',
      updatedAt: '2026-08-16T09:00:00.000Z',
      messages: [
        {
          id: 'message-failed-canvas',
          threadId: 'thread-failed-canvas',
          author: { id: 'user-1', displayName: 'Author' },
          body: 'This move will fail.',
          createdAt: '2026-08-16T09:00:00.000Z',
        },
      ],
    };
    vi.mocked(api.listCommentThreads).mockResolvedValue([thread]);
    vi.mocked(api.updateCommentThreadAnchor).mockRejectedValue(
      new Error('The connection was interrupted.'),
    );

    await renderEditor(story);
    await user.click(await screen.findByTestId('drag-node-comment:thread-failed-canvas'));

    expect(await screen.findByRole('alert')).toHaveTextContent('The connection was interrupted.');
    expect(screen.getByRole('button', { name: 'Reload comments' })).toBeInTheDocument();
    expect(screen.getByTestId('flow-node-comment:thread-failed-canvas')).toHaveAttribute(
      'data-node-x',
      '80',
    );
    expect(screen.getByTestId('flow-node-comment:thread-failed-canvas')).toHaveAttribute(
      'data-node-y',
      '90',
    );
  });

  it('keeps contextual comments collapsed until their inspector control is used', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    vi.mocked(api.listCommentThreads).mockResolvedValue([
      {
        id: 'thread-interaction-2',
        storyId: story.id,
        anchor: { kind: 'entity', targetType: 'interaction', targetId: 'interaction-2' },
        anchorLabel: 'Second interaction',
        status: 'open',
        createdBy: { id: 'user-1', displayName: 'Author' },
        createdAt: '2026-08-16T09:00:00.000Z',
        updatedAt: '2026-08-16T09:00:00.000Z',
        messages: [
          {
            id: 'message-1',
            threadId: 'thread-interaction-2',
            author: { id: 'user-1', displayName: 'Author' },
            body: 'Keep this collapsed by default.',
            createdAt: '2026-08-16T09:00:00.000Z',
          },
        ],
      },
    ]);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-node-interaction-2'));

    expect(
      screen.queryByRole('complementary', { name: 'Comments for the selected element' }),
    ).not.toBeInTheDocument();
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    await user.click(
      within(inspector).getByRole('button', { name: 'Open comments for this element' }),
    );

    expect(
      screen.getByRole('complementary', { name: 'Comments for the selected element' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Collapse comments for this element' }));
    expect(
      screen.queryByRole('complementary', { name: 'Comments for the selected element' }),
    ).not.toBeInTheDocument();
  });

  it('opens an anchored text discussion from its inspector field marker', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    vi.mocked(api.listCommentThreads).mockResolvedValue([
      {
        id: 'thread-interaction-title',
        storyId: story.id,
        anchor: {
          kind: 'text',
          targetType: 'interaction',
          targetId: 'interaction-2',
          field: 'title',
          selector: {
            exact: 'Second interaction',
            prefix: '',
            suffix: '',
            start: 0,
            end: 18,
            sourceHash: 'title-hash',
          },
        },
        anchorLabel: 'Second interaction',
        status: 'open',
        createdBy: { id: 'user-1', displayName: 'Author' },
        createdAt: '2026-08-16T09:00:00.000Z',
        updatedAt: '2026-08-16T09:00:00.000Z',
        messages: [
          {
            id: 'message-title',
            threadId: 'thread-interaction-title',
            author: { id: 'user-1', displayName: 'Author' },
            body: 'The title needs more context.',
            createdAt: '2026-08-16T09:00:00.000Z',
          },
        ],
      },
    ]);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-node-interaction-2'));

    expect(
      screen.queryByRole('complementary', { name: 'Comments for the selected element' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open comments for Title' }));

    expect(
      screen.getByRole('complementary', { name: 'Comments for the selected element' }),
    ).toBeInTheDocument();
    expect(screen.getByText('The title needs more context.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Reply' })).toBeInTheDocument();
  });

  it('applies remote story content, positions, context, and decorations without reloading', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    await renderEditor();

    const remote = cloneStory();
    remote.revision = 2;
    remote.title = 'Remote story title';
    remote.interactions[0].title = 'Remote interaction';
    remote.interactions[0].position = { x: 420, y: 260 };
    remote.locations = [
      { id: 'remote-location', name: 'Remote location', description: 'Created elsewhere' },
    ];
    remote.graphDecorations = [
      {
        id: 'remote-decoration',
        kind: 'text',
        position: { x: 30, y: 40 },
        text: 'Remote note',
        color: '#123456',
        fontSize: 24,
        fontFamily: 'sans',
        fontWeight: 'normal',
        fontStyle: 'normal',
      },
    ];
    vi.mocked(api.getStory).mockResolvedValue(cloneStory(remote));

    const source = FakeEventSource.instances.find(
      ({ url }) => url === '/api/stories/story-1/events',
    );
    expect(source).toBeDefined();
    act(() => source?.emit('story-changed'));

    expect(await screen.findByDisplayValue('Remote story title')).toBeInTheDocument();
    expect(await screen.findByText('Remote interaction')).toBeInTheDocument();
    expect(await screen.findByText('Remote location')).toBeInTheDocument();
    expect(await screen.findByText('Remote note')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('flow-node-interaction-1')).toHaveAttribute('data-node-x', '420');
      expect(screen.getByTestId('flow-node-interaction-1')).toHaveAttribute('data-node-y', '260');
    });
  });

  it('keeps an active local draft until it is saved before applying a remote refresh', async () => {
    vi.stubGlobal('EventSource', FakeEventSource);
    await renderEditor();

    const combined = cloneStory();
    combined.revision = 3;
    combined.title = 'Local draft';
    combined.locations = [
      { id: 'remote-location', name: 'Remote location', description: 'Created elsewhere' },
    ];
    vi.mocked(api.renameStory).mockResolvedValue(cloneStory(combined));
    vi.mocked(api.getStory).mockResolvedValue(cloneStory(combined));

    const titleInput = screen.getByDisplayValue('Test story');
    fireEvent.focus(titleInput);
    fireEvent.change(titleInput, { target: { value: 'Local draft' } });
    const source = FakeEventSource.instances.find(
      ({ url }) => url === '/api/stories/story-1/events',
    );
    act(() => source?.emit('story-changed'));
    await act(() => new Promise((resolve) => setTimeout(resolve, 120)));

    expect(titleInput).toHaveValue('Local draft');
    expect(api.getStory).toHaveBeenCalledOnce();

    fireEvent.blur(titleInput);
    expect(await screen.findByText('Remote location')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Local draft')).toBeInTheDocument();
    expect(api.renameStory).toHaveBeenCalledWith('story-1', 'Local draft');
    expect(api.getStory).toHaveBeenCalledTimes(2);
  });

  it('reserves canvas panning for the middle button or Space plus drag', async () => {
    await renderEditor();

    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-pan-on-drag', '[1]');
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-pan-activation-key', 'Space');
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-selection-on-drag', 'true');
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-selection-mode', 'full');
  });

  it('selects contained interactions and triggers with a rectangle and summarizes them', async () => {
    const user = userEvent.setup();
    await renderEditor(storyWithThreeInteractions());

    await user.click(screen.getByTestId('box-select-first-branch'));

    expect(screen.getByRole('heading', { name: 'Selected elements' })).toBeInTheDocument();
    expect(screen.getByText('2 interactions selected')).toBeInTheDocument();
    expect(screen.getByText('1 trigger selected')).toBeInTheDocument();
    expect(screen.getByTestId('flow-node-interaction-1')).toHaveAttribute(
      'data-node-selected',
      'true',
    );
    expect(screen.getByTestId('flow-node-interaction-2')).toHaveAttribute(
      'data-node-selected',
      'true',
    );
    expect(screen.getByTestId('flow-node-trigger:interaction-2:trigger-2')).toHaveAttribute(
      'data-node-selected',
      'true',
    );
    expect(screen.getByTestId('flow-node-interaction-3')).toHaveAttribute(
      'data-node-selected',
      'false',
    );

    await user.click(screen.getByTestId('flow-pane'));

    expect(screen.queryByRole('heading', { name: 'Selected elements' })).not.toBeInTheDocument();
    expect(screen.getByTestId('flow-node-interaction-1')).toHaveAttribute(
      'data-node-selected',
      'false',
    );
  });

  it('moves every selected interaction and trigger when one selected element is dragged', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    await renderEditor(story);
    await user.click(screen.getByTestId('box-select-first-branch'));
    const triggerNode = screen.getByTestId('flow-node-trigger:interaction-2:trigger-2');
    const triggerPosition = {
      x: Number(triggerNode.getAttribute('data-node-x')) + 25,
      y: Number(triggerNode.getAttribute('data-node-y')) + 15,
    };

    await user.click(screen.getByTestId('drag-node-interaction-1'));

    await waitFor(() => {
      expect(api.updateStoryGraphPositions).toHaveBeenCalledWith('story-1', {
        interactionUpdates: [
          { interactionId: 'interaction-1', position: { x: 105, y: 135 } },
          { interactionId: 'interaction-2', position: { x: 105, y: 285 } },
        ],
        triggerUpdates: [
          {
            interactionId: 'interaction-2',
            triggerIds: ['trigger-2'],
            position: triggerPosition,
          },
        ],
      });
    });
  });

  it('groups icon-only canvas actions in an accessible toolbar with hover labels', async () => {
    await renderEditor();

    const toolbar = screen.getByRole('toolbar', { name: 'Canvas tools' });
    expect(toolbar).toHaveClass('canvas-tools');
    expect(within(toolbar).getAllByRole('button')).toHaveLength(8);

    for (const label of [
      'Undo last Story change',
      'Redo Story change',
      'Open Story history',
      'Add root',
      'Add frame',
      'Add text',
      'Organize graph',
      'Place a post-it',
    ]) {
      const button = within(toolbar).getByRole('button', { name: label });
      expect(button).toHaveClass('canvas-tool-action');
      expect(button).toHaveAttribute('data-tooltip', label);
      expect(button.querySelector('svg')).toBeInTheDocument();
      expect(button.textContent).toBe('');
    }
  });

  it('opens a position-aware canvas context menu for creation and comments', async () => {
    const user = userEvent.setup();
    const flowPosition = { x: 350, y: 260 };
    const framePosition = { x: 140, y: 140 };
    const openContextMenu = () =>
      fireEvent.contextMenu(screen.getByTestId('flow-pane'), {
        clientX: 400,
        clientY: 300,
      });
    await renderEditor();

    openContextMenu();
    const menu = screen.getByRole('menu', { name: 'Canvas actions' });
    expect(menu).toHaveStyle({ left: '400px', top: '300px' });
    for (const label of [
      'Add interaction',
      'Add comment',
      'Add frame',
      'Add text',
      'Automatic organization',
    ]) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeInTheDocument();
    }
    await user.click(within(menu).getByRole('menuitem', { name: 'Automatic organization' }));
    const organizeMenu = screen.getByRole('menu', { name: 'Automatic organization' });
    expect(within(organizeMenu).getByRole('menuitem', { name: 'Whole graph' })).toBeEnabled();
    expect(
      within(organizeMenu).getByRole('menuitem', { name: 'Current selection' }),
    ).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Canvas actions' })).not.toBeInTheDocument();

    const withInteraction = cloneStory();
    withInteraction.interactions.push({
      id: 'context-interaction',
      title: 'Context interaction',
      body: '',
      position: flowPosition,
      triggers: [{ id: 'context-trigger', inputInteractionIds: [], conditions: [] }],
    });
    vi.mocked(api.createInteraction).mockResolvedValue(
      interactionMutation(withInteraction, 'context-interaction'),
    );
    openContextMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Add interaction' }));
    expect(api.createInteraction).toHaveBeenCalledWith('story-1', { position: flowPosition });

    const withFrame = cloneStory();
    withFrame.graphDecorations = [
      {
        id: 'context-frame',
        kind: 'frame',
        position: framePosition,
        color: '#5b6ee1',
        width: 420,
        height: 240,
      },
    ];
    vi.mocked(api.createGraphDecoration).mockResolvedValueOnce(
      graphDecorationMutation(withFrame, 'context-frame'),
    );
    openContextMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Add frame' }));
    expect(api.createGraphDecoration).toHaveBeenCalledWith('story-1', {
      kind: 'frame',
      position: framePosition,
    });

    const withText = cloneStory();
    withText.graphDecorations = [
      {
        id: 'context-text',
        kind: 'text',
        position: flowPosition,
        color: '#273043',
        text: 'Aa',
        fontSize: 32,
        fontFamily: 'sans',
        fontWeight: 'normal',
        fontStyle: 'normal',
      },
    ];
    vi.mocked(api.createGraphDecoration).mockResolvedValueOnce(
      graphDecorationMutation(withText, 'context-text'),
    );
    openContextMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Add text' }));
    expect(api.createGraphDecoration).toHaveBeenCalledWith('story-1', {
      kind: 'text',
      position: flowPosition,
    });

    openContextMenu();
    await user.click(screen.getByRole('menuitem', { name: 'Add comment' }));
    expect(await screen.findByTestId('flow-node-comment:draft')).toHaveAttribute(
      'data-node-x',
      String(flowPosition.x),
    );
    expect(screen.getByRole('textbox', { name: 'Comment' })).toBeInTheDocument();
  });

  it('offers interaction actions from the existing graph context menu', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const withChild = structuredClone(story);
    withChild.interactions.push({
      id: 'interaction-3',
      title: 'Context child',
      body: '',
      position: { x: 80, y: 420 },
      triggers: [{ id: 'trigger-3', inputInteractionIds: ['interaction-1'], conditions: [] }],
    });
    vi.mocked(api.createInteraction).mockResolvedValue(
      interactionMutation(withChild, 'interaction-3'),
    );

    await renderEditor(story);
    fireEvent.contextMenu(screen.getByTestId('flow-node-interaction-1'), {
      clientX: 320,
      clientY: 240,
    });

    const menu = screen.getByRole('menu', { name: 'Graph element actions' });
    for (const label of [
      'Add comment',
      'Add child interaction',
      'Place automatically',
      'Delete interaction',
    ]) {
      expect(within(menu).getByRole('menuitem', { name: label })).toBeInTheDocument();
    }

    await user.click(within(menu).getByRole('menuitem', { name: 'Add child interaction' }));
    expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
      parentId: 'interaction-1',
      position: expect.any(Object),
    });
  });

  it('targets linked and root triggers from their contextual actions', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const withoutLinkedTrigger = structuredClone(story);
    withoutLinkedTrigger.interactions[1].triggers = [];
    const withoutRootTrigger = structuredClone(story);
    withoutRootTrigger.interactions[0].triggers = [];
    vi.mocked(api.deleteTrigger)
      .mockResolvedValueOnce(withoutLinkedTrigger)
      .mockResolvedValueOnce(withoutRootTrigger);

    await renderEditor(story);
    fireEvent.contextMenu(screen.getByTestId('flow-node-trigger:interaction-2:trigger-2'), {
      clientX: 440,
      clientY: 260,
    });

    let menu = screen.getByRole('menu', { name: 'Graph element actions' });
    expect(within(menu).getByRole('menuitem', { name: 'Add comment' })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: 'Place automatically' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Add child interaction' })).toBeNull();
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete trigger' }));
    expect(api.deleteTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2');

    const rootTrigger = within(screen.getByTestId('flow-node-interaction-1')).getByRole('button', {
      name: 'Select root trigger',
    });
    fireEvent.contextMenu(rootTrigger, { clientX: 320, clientY: 160 });
    menu = screen.getByRole('menu', { name: 'Graph element actions' });
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete trigger' }));
    expect(api.deleteTrigger).toHaveBeenLastCalledWith('story-1', 'interaction-1', 'trigger-1');
  });

  it('deletes the selected graph element with Delete only outside editable fields', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const afterDelete = structuredClone(story);
    afterDelete.interactions = afterDelete.interactions.filter(({ id }) => id !== 'interaction-1');
    vi.mocked(api.deleteInteraction).mockResolvedValue(afterDelete);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-node-interaction-1'));

    const title = screen.getByLabelText('Title');
    title.focus();
    fireEvent.keyDown(title, { key: 'Delete' });
    expect(api.deleteInteraction).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Delete' });
    expect(api.deleteInteraction).toHaveBeenCalledWith('story-1', 'interaction-1');
  });

  it('organizes the current graph selection from the canvas context submenu', async () => {
    const user = userEvent.setup();
    await renderEditor(storyWithThreeInteractions());
    await user.click(screen.getByTestId('box-select-first-branch'));

    fireEvent.contextMenu(screen.getByTestId('flow-pane'), { clientX: 400, clientY: 300 });
    await user.click(screen.getByRole('menuitem', { name: 'Automatic organization' }));
    const organizeMenu = screen.getByRole('menu', { name: 'Automatic organization' });
    const organizeSelection = within(organizeMenu).getByRole('menuitem', {
      name: 'Current selection',
    });
    expect(organizeSelection).toBeEnabled();
    await user.click(organizeSelection);

    await waitFor(() => expect(api.updateStoryGraphPositions).toHaveBeenCalled());
    const updates = vi.mocked(api.updateStoryGraphPositions).mock.calls[0][1];
    expect(updates.interactionUpdates.map(({ interactionId }) => interactionId)).not.toContain(
      'interaction-3',
    );
  });

  it('automatically organizes the complete graph and persists interaction and trigger positions', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const expected = computeStoryGraphLayout(story, { kind: 'all' });
    await renderEditor(story);

    await user.click(screen.getByRole('button', { name: 'Organize graph' }));

    await waitFor(() =>
      expect(api.updateStoryGraphPositions).toHaveBeenCalledWith('story-1', {
        interactionUpdates: expected.interactionUpdates,
        triggerUpdates: expected.triggerUpdates,
      }),
    );
    expected.interactionUpdates.forEach(({ interactionId, position }) => {
      expect(screen.getByTestId(`flow-node-${interactionId}`)).toHaveAttribute(
        'data-node-y',
        String(position.y),
      );
    });
  });

  it('automatically organizes only the selected interaction', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    const expected = computeStoryGraphLayout(story, {
      kind: 'selection',
      targets: [{ type: 'interaction', interactionId: 'interaction-2' }],
    });
    await renderEditor(story);

    await user.click(screen.getByTestId('flow-node-interaction-2'));
    await user.click(screen.getByRole('button', { name: 'Organize selected element' }));

    await waitFor(() =>
      expect(api.updateStoryGraphPositions).toHaveBeenCalledWith('story-1', {
        interactionUpdates: expected.interactionUpdates,
        triggerUpdates: expected.triggerUpdates,
      }),
    );
  });

  it('automatically organizes only the selected linked trigger marker', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const expected = computeStoryGraphLayout(story, {
      kind: 'selection',
      targets: [{ type: 'trigger', interactionId: 'interaction-2', triggerId: 'trigger-2' }],
    });
    await renderEditor(story);

    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-2'));
    await user.click(screen.getByRole('button', { name: 'Organize selected element' }));

    await waitFor(() =>
      expect(api.updateStoryGraphPositions).toHaveBeenCalledWith('story-1', {
        interactionUpdates: expected.interactionUpdates,
        triggerUpdates: expected.triggerUpdates,
      }),
    );
  });

  it('automatically organizes every element in a rectangular selection and nothing else', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    const expected = computeStoryGraphLayout(story, {
      kind: 'selection',
      targets: [
        { type: 'interaction', interactionId: 'interaction-1' },
        { type: 'interaction', interactionId: 'interaction-2' },
        { type: 'trigger', interactionId: 'interaction-2', triggerId: 'trigger-2' },
      ],
    });
    await renderEditor(story);

    await user.click(screen.getByTestId('box-select-first-branch'));
    await user.click(screen.getByRole('button', { name: 'Organize 3 selected elements' }));

    await waitFor(() =>
      expect(api.updateStoryGraphPositions).toHaveBeenCalledWith('story-1', {
        interactionUpdates: expected.interactionUpdates,
        triggerUpdates: expected.triggerUpdates,
      }),
    );
  });

  it('previews automatic trigger placement while an interaction is moving', async () => {
    const linkedStory = storyWithTwoInteractions();
    await renderEditor(linkedStory);
    const triggerNode = screen.getByTestId('flow-node-trigger:interaction-2:trigger-2');
    const initialX = triggerNode.getAttribute('data-node-x');
    const initialY = triggerNode.getAttribute('data-node-y');

    await userEvent.click(screen.getByTestId('preview-drag-node-interaction-2'));

    await waitFor(() => {
      expect(triggerNode).not.toHaveAttribute('data-node-x', initialX);
      expect(triggerNode).not.toHaveAttribute('data-node-y', initialY);
    });
    expect(api.updateStoryGraphPositions).not.toHaveBeenCalled();
  });

  it('previews and persists an elastic movement for a positioned trigger', async () => {
    const linkedStory = storyWithTwoInteractions();
    linkedStory.interactions[1].triggers[0].position = { x: 400, y: 300 };
    const finalInteractionPosition = { x: 105, y: 135 };
    const expectedUpdate = getInteractionDragTriggerPositionUpdates(
      linkedStory,
      'interaction-1',
      finalInteractionPosition,
    )[0];
    await renderEditor(linkedStory);
    const triggerNodeId = 'flow-node-trigger:interaction-2:trigger-2';

    await userEvent.click(screen.getByTestId('drag-node-interaction-1'));

    await waitFor(() => {
      expect(api.updateStoryGraphPositions).toHaveBeenCalledWith('story-1', {
        interactionUpdates: [
          { interactionId: 'interaction-1', position: finalInteractionPosition },
        ],
        triggerUpdates: [
          {
            interactionId: 'interaction-2',
            triggerIds: ['trigger-2'],
            position: expectedUpdate.position,
          },
        ],
      });
    });
    expect(screen.getByTestId(triggerNodeId)).toHaveAttribute(
      'data-node-x',
      String(expectedUpdate.position.x),
    );
    expect(screen.getByTestId(triggerNodeId)).toHaveAttribute(
      'data-node-y',
      String(expectedUpdate.position.y),
    );
  });

  it('adds, moves, and resizes a frame behind narrative nodes', async () => {
    const user = userEvent.setup();
    const saved = cloneStory();
    saved.graphDecorations = [
      {
        id: 'frame-1',
        kind: 'frame',
        position: { x: -260, y: -160 },
        color: '#5b6ee1',
        width: 420,
        height: 240,
      },
    ];
    vi.mocked(api.createGraphDecoration).mockResolvedValue(
      graphDecorationMutation(saved, 'frame-1'),
    );
    vi.mocked(api.updateGraphDecoration).mockImplementation(
      async (_storyId, decorationId, patch) => {
        const updated = updateGraphDecorationInStory(saved, decorationId, patch);
        saved.graphDecorations = updated.graphDecorations;
        return graphDecorationMutation(saved, decorationId);
      },
    );

    await renderEditor();
    await user.click(screen.getByRole('button', { name: 'Add frame' }));

    const frame = await screen.findByTestId('flow-node-frame-1');
    expect(frame).toHaveAttribute('data-z-index', '-1000');
    expect(frame).toHaveStyle({ width: '420px', height: '240px' });

    await user.click(frame);
    await user.click(screen.getByTestId('resize-decoration'));
    expect(api.updateGraphDecoration).toHaveBeenCalledWith('story-1', 'frame-1', {
      position: { x: -260, y: -160 },
      width: 500,
      height: 320,
    });
    expect(frame).toHaveAttribute('data-node-x', '-260');
    expect(frame).toHaveAttribute('data-node-y', '-160');

    await user.click(screen.getByTestId('drag-node-frame-1'));
    expect(api.updateGraphDecoration).toHaveBeenCalledWith('story-1', 'frame-1', {
      position: { x: -235, y: -145 },
    });
  });

  it('edits text decoration typography and deletes the decoration', async () => {
    const user = userEvent.setup();
    const decoratedStory = cloneStory();
    decoratedStory.graphDecorations = [
      {
        id: 'text-1',
        kind: 'text',
        position: { x: 30, y: 40 },
        color: '#273043',
        text: 'Act one',
        fontSize: 32,
        fontFamily: 'sans',
        fontWeight: 'normal',
        fontStyle: 'normal',
      },
    ];
    vi.mocked(api.updateGraphDecoration).mockImplementation(
      async (_storyId, decorationId, patch) => {
        const updated = updateGraphDecorationInStory(decoratedStory, decorationId, patch);
        decoratedStory.graphDecorations = updated.graphDecorations;
        return graphDecorationMutation(decoratedStory, decorationId);
      },
    );
    vi.mocked(api.deleteGraphDecoration).mockImplementation(async () => {
      decoratedStory.graphDecorations = [];
      return structuredClone(decoratedStory);
    });

    await renderEditor(decoratedStory);
    await user.click(screen.getByTestId('flow-node-text-1'));

    const content = screen.getByRole('textbox', { name: 'Content' });
    await user.clear(content);
    await user.type(content, 'Opening act');
    fireEvent.blur(content);
    fireEvent.change(screen.getByLabelText('Text size'), { target: { value: '48' } });
    fireEvent.blur(screen.getByLabelText('Text size'));
    await user.selectOptions(screen.getByLabelText('Font'), 'serif');
    await user.click(screen.getByRole('checkbox', { name: 'Bold' }));
    await user.click(screen.getByRole('checkbox', { name: 'Italic' }));

    await waitFor(() => {
      expect(api.updateGraphDecoration).toHaveBeenCalledWith('story-1', 'text-1', {
        text: 'Opening act',
      });
      expect(api.updateGraphDecoration).toHaveBeenCalledWith('story-1', 'text-1', {
        fontSize: 48,
      });
      expect(api.updateGraphDecoration).toHaveBeenCalledWith('story-1', 'text-1', {
        fontFamily: 'serif',
      });
      expect(api.updateGraphDecoration).toHaveBeenCalledWith('story-1', 'text-1', {
        fontWeight: 'bold',
      });
      expect(api.updateGraphDecoration).toHaveBeenCalledWith('story-1', 'text-1', {
        fontStyle: 'italic',
      });
    });

    await user.click(screen.getByRole('button', { name: 'Delete decoration' }));
    expect(api.deleteGraphDecoration).toHaveBeenCalledWith('story-1', 'text-1');
    await waitFor(() => expect(screen.queryByTestId('flow-node-text-1')).not.toBeInTheDocument());
  });

  it('deletes a graph decoration from its contextual actions', async () => {
    const user = userEvent.setup();
    const story = cloneStory();
    story.graphDecorations = [
      {
        id: 'frame-context',
        kind: 'frame',
        position: { x: 20, y: 30 },
        color: '#5b6ee1',
        width: 420,
        height: 240,
      },
    ];
    const afterDelete = structuredClone(story);
    afterDelete.graphDecorations = [];
    vi.mocked(api.deleteGraphDecoration).mockResolvedValue(afterDelete);

    await renderEditor(story);
    fireEvent.contextMenu(screen.getByTestId('flow-node-frame-context'), {
      clientX: 300,
      clientY: 200,
    });

    const menu = screen.getByRole('menu', { name: 'Graph element actions' });
    expect(within(menu).queryByRole('menuitem', { name: 'Add comment' })).toBeNull();
    await user.click(within(menu).getByRole('menuitem', { name: 'Delete decoration' }));

    expect(api.deleteGraphDecoration).toHaveBeenCalledWith('story-1', 'frame-context');
    expect(window.confirm).toHaveBeenCalledWith('Delete this graph decoration?');
  });
});
