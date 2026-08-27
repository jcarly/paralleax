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
      createdBy: { id: 'user-1', email: 'author@example.com' },
      createdAt: '2026-08-16T09:00:00.000Z',
      updatedAt: '2026-08-16T09:00:00.000Z',
      messages: [
        {
          id: 'message-1',
          threadId: 'thread-interaction-2',
          author: { id: 'user-1', email: 'author@example.com' },
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
      expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', {
        position: { x: 105, y: 135 },
      });
      expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-2', {
        position: { x: 105, y: 285 },
      });
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        position: triggerPosition,
      });
    });
    expect(api.updateInteraction).not.toHaveBeenCalledWith(
      'story-1',
      'interaction-3',
      expect.anything(),
    );
  });

  it('groups icon-only canvas actions in an accessible toolbar with hover labels', async () => {
    await renderEditor();

    const toolbar = screen.getByRole('toolbar', { name: 'Canvas tools' });
    expect(toolbar).toHaveClass('canvas-tools');
    expect(within(toolbar).getAllByRole('button')).toHaveLength(5);

    for (const label of [
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

  it('automatically organizes the complete graph and persists interaction and trigger positions', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const expected = computeStoryGraphLayout(story, { kind: 'all' });
    await renderEditor(story);

    await user.click(screen.getByRole('button', { name: 'Organize graph' }));

    await waitFor(() => {
      expect(api.updateInteraction).toHaveBeenCalledTimes(expected.interactionUpdates.length);
      expect(api.updateTrigger).toHaveBeenCalledTimes(
        expected.triggerUpdates.reduce((total, update) => total + update.triggerIds.length, 0),
      );
    });
    expected.interactionUpdates.forEach(({ interactionId, position }) => {
      expect(api.updateInteraction).toHaveBeenCalledWith('story-1', interactionId, { position });
      expect(screen.getByTestId(`flow-node-${interactionId}`)).toHaveAttribute(
        'data-node-y',
        String(position.y),
      );
    });
    expected.triggerUpdates.forEach(({ interactionId, triggerIds, position }) => {
      triggerIds.forEach((triggerId) =>
        expect(api.updateTrigger).toHaveBeenCalledWith('story-1', interactionId, triggerId, {
          position,
        }),
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

    await waitFor(() => {
      expect(api.updateInteraction).toHaveBeenCalledTimes(expected.interactionUpdates.length);
    });
    expect(api.updateInteraction).not.toHaveBeenCalledWith(
      'story-1',
      'interaction-1',
      expect.anything(),
    );
    expect(api.updateInteraction).not.toHaveBeenCalledWith(
      'story-1',
      'interaction-3',
      expect.anything(),
    );
    expected.interactionUpdates.forEach(({ interactionId, position }) =>
      expect(api.updateInteraction).toHaveBeenCalledWith('story-1', interactionId, { position }),
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

    expect(api.updateInteraction).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        position: expected.triggerUpdates[0].position,
      });
    });
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

    await waitFor(() => {
      expect(api.updateInteraction).toHaveBeenCalledTimes(expected.interactionUpdates.length);
      expect(api.updateTrigger).toHaveBeenCalledTimes(
        expected.triggerUpdates.reduce((total, update) => total + update.triggerIds.length, 0),
      );
    });
    expect(api.updateInteraction).not.toHaveBeenCalledWith(
      'story-1',
      'interaction-3',
      expect.anything(),
    );
    expected.interactionUpdates.forEach(({ interactionId, position }) =>
      expect(api.updateInteraction).toHaveBeenCalledWith('story-1', interactionId, { position }),
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
    expect(api.updateInteraction).not.toHaveBeenCalled();
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
      expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', {
        position: finalInteractionPosition,
      });
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        position: expectedUpdate.position,
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
      width: 500,
      height: 320,
    });

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
});
