import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  updateGraphDecorationInStory,
  type GraphDecorationMutationResult,
  type InteractionMutationResult,
  type Story,
  type StoryCommentThread,
  type TriggerMutationResult,
} from '@paralleax/shared';
import { StoryEditor } from './StoryEditor';
import { api } from '../api';
import { getInteractionDragTriggerPositionUpdates } from '../storyGraph';
import { getStoryGraphClickCreationPosition } from '../storyGraphCreationLayout';
import { computeStoryGraphLayout } from '../storyGraphLayout';

vi.mock('../api', () => ({
  api: {
    getStory: vi.fn(),
    createInteraction: vi.fn(),
    updateInteraction: vi.fn(),
    deleteInteraction: vi.fn(),
    createGraphDecoration: vi.fn(),
    updateGraphDecoration: vi.fn(),
    deleteGraphDecoration: vi.fn(),
    renameStory: vi.fn(),
    updateStory: vi.fn(),
    addTrigger: vi.fn(),
    updateTrigger: vi.fn(),
    deleteTrigger: vi.fn(),
    createLocation: vi.fn(),
    updateLocation: vi.fn(),
    createCharacter: vi.fn(),
    updateCharacter: vi.fn(),
    createStatDefinition: vi.fn(),
    updateStatDefinition: vi.fn(),
    createItemDefinition: vi.fn(),
    updateItemDefinition: vi.fn(),
    createCharacterStat: vi.fn(),
    updateCharacterStat: vi.fn(),
    createCharacterItem: vi.fn(),
    listCommentThreads: vi.fn(),
    createCommentThread: vi.fn(),
    addCommentMessage: vi.fn(),
    updateCommentThreadStatus: vi.fn(),
    updateCommentThreadAnchor: vi.fn(),
  },
}));

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, Array<() => void>>();
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  emit(type: string) {
    this.listeners.get(type)?.forEach((listener) => listener());
  }

  close() {}
}

vi.mock('@xyflow/react', async () => {
  const React = await import('react');

  return {
    Background: () => <div data-testid="flow-background" />,
    Controls: () => <div data-testid="flow-controls" />,
    Handle: ({ children, ...props }: any) => (
      <div {...props} data-testid={`handle-${props.type}`}>
        {children}
      </div>
    ),
    MarkerType: { ArrowClosed: 'arrowclosed' },
    MiniMap: () => <div data-testid="flow-minimap" />,
    NodeResizer: ({ isVisible, onResizeEnd }: any) =>
      isVisible ? (
        <button
          data-testid="resize-decoration"
          onClick={(event) => onResizeEnd?.(event, { width: 500, height: 320 })}
        />
      ) : null,
    Position: { Bottom: 'bottom', Left: 'left', Right: 'right', Top: 'top' },
    SelectionMode: { Full: 'full', Partial: 'partial' },
    ReactFlow: ({
      nodes,
      edges,
      nodeTypes,
      onInit,
      onConnect,
      onConnectStart,
      onConnectEnd,
      onNodeClick,
      onNodeDragStart,
      onNodeDrag,
      onPaneClick,
      onNodeDragStop,
      onSelectionStart,
      onSelectionChange,
      onSelectionEnd,
      panOnDrag,
      panActivationKeyCode,
      selectionOnDrag,
      selectionMode,
      minZoom,
      children,
    }: any) => {
      const onInitRef = React.useRef(onInit);
      React.useEffect(() => {
        onInitRef.current?.({
          screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x: x - 50, y: y - 40 }),
          fitView: vi.fn(),
        });
      }, []);

      return (
        <div
          data-testid="react-flow"
          data-min-zoom={minZoom}
          data-pan-on-drag={JSON.stringify(panOnDrag)}
          data-pan-activation-key={panActivationKeyCode}
          data-selection-on-drag={selectionOnDrag}
          data-selection-mode={selectionMode}
        >
          <button data-testid="flow-pane" onClick={(event) => onPaneClick?.(event)} />
          <button
            data-testid="box-select-first-branch"
            onClick={(event) => {
              const selectedNodes = nodes.filter((node: any) =>
                ['interaction-1', 'interaction-2', 'trigger:interaction-2:trigger-2'].includes(
                  node.id,
                ),
              );
              onSelectionStart?.(event);
              onSelectionChange?.({ nodes: selectedNodes, edges: [] });
              onSelectionEnd?.(event);
            }}
          />
          {nodes.map((node: any) => {
            const NodeComponent = nodeTypes[node.type];
            return (
              <div
                key={node.id}
                data-testid={`flow-node-${node.id}`}
                data-z-index={node.zIndex}
                data-node-x={node.position.x}
                data-node-y={node.position.y}
                data-node-selected={node.selected ? 'true' : 'false'}
                style={node.style}
                onClick={(event) => onNodeClick?.(event, node)}
                role="button"
                tabIndex={0}
              >
                <NodeComponent id={node.id} data={node.data} />
                <span
                  data-testid={`preview-drag-node-${node.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    const movedNodes = (
                      node.selected ? nodes.filter((candidate: any) => candidate.selected) : [node]
                    ).map((candidate: any) => ({
                      ...candidate,
                      position: {
                        x: candidate.position.x + 100,
                        y: candidate.position.y + 80,
                      },
                    }));
                    const movedNode = movedNodes.find((candidate: any) => candidate.id === node.id);
                    onNodeDrag?.(event, movedNode, movedNodes);
                  }}
                />
                <span
                  data-testid={`drag-node-${node.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    const selectedNodes = node.selected
                      ? nodes.filter((candidate: any) => candidate.selected)
                      : [node];
                    const movedNodes = selectedNodes.map((candidate: any) => ({
                      ...candidate,
                      position: {
                        x: candidate.position.x + 25,
                        y: candidate.position.y + 15,
                      },
                    }));
                    const movedNode = movedNodes.find((candidate: any) => candidate.id === node.id);
                    onNodeDragStart?.(event, node, selectedNodes);
                    onNodeDragStop?.(event, movedNode, movedNodes);
                  }}
                />
                <span
                  data-testid={`drop-source-${node.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onConnectStart?.(event, { nodeId: node.id, handleType: 'source' });
                    onConnectEnd?.(event, {
                      isValid: null,
                      toNode: null,
                      pointer: { x: 580, y: 452 },
                    });
                  }}
                />
                <span
                  data-testid={`begin-source-${node.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onConnectStart?.(event, { nodeId: node.id, handleType: 'source' });
                  }}
                />
                <span
                  data-testid={`drop-target-${node.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onConnectStart?.(event, { nodeId: node.id, handleType: 'target' });
                    onConnectEnd?.(event, {
                      isValid: null,
                      toNode: null,
                      pointer: { x: 320, y: 328 },
                    });
                  }}
                />
              </div>
            );
          })}
          {nodes.flatMap((source: any) =>
            nodes
              .filter((target: any) => target.id !== source.id)
              .map((target: any) => (
                <button
                  key={`${source.id}-${target.id}`}
                  data-testid={`connect-${source.id}-${target.id}`}
                  onClick={() => onConnect?.({ source: source.id, target: target.id })}
                />
              )),
          )}
          {edges.map((edge: any) => (
            <div key={edge.id}>
              <button
                className={edge.className}
                data-testid={
                  edge.data?.inputInteractionId
                    ? `flow-edge-${edge.data.inputInteractionId}-${edge.data.interactionId}`
                    : `flow-edge-${edge.source}-${edge.target}`
                }
              />
              {edge.data?.inputInteractionId ? (
                <button
                  data-testid={`delete-link-${edge.data.inputInteractionId}-${edge.data.interactionId}`}
                  onClick={() =>
                    (edge.data.triggerIds ?? [edge.data.triggerId]).forEach((triggerId: string) =>
                      edge.data.onDeleteTriggerInput?.(
                        edge.data.interactionId,
                        triggerId,
                        edge.data.inputInteractionId,
                      ),
                    )
                  }
                />
              ) : null}
            </div>
          ))}
          {nodes
            .filter((node: any) => node.type === 'trigger')
            .flatMap((triggerNode: any) =>
              nodes
                .filter((node: any) => node.type === 'interaction')
                .filter((node: any) => node.id !== triggerNode.data.interactionId)
                .map((node: any) => (
                  <button
                    key={`${node.id}-${triggerNode.id}`}
                    data-testid={`drop-source-${node.id}-on-trigger-${triggerNode.data.interactionId}`}
                    data-trigger-drop-target="true"
                    data-interaction-id={triggerNode.data.interactionId}
                    data-trigger-id={triggerNode.data.triggerId}
                    onClick={(event) => {
                      onConnectStart?.(event, { nodeId: node.id, handleType: 'source' });
                      onConnectEnd?.(event, {
                        isValid: null,
                        toNode: null,
                        pointer: null,
                      });
                    }}
                  />
                )),
            )}
          {nodes
            .filter((node: any) => node.type === 'interaction' && node.data.rootTriggerId)
            .flatMap((targetNode: any) =>
              nodes
                .filter((node: any) => node.type === 'interaction')
                .filter((sourceNode: any) => sourceNode.id !== targetNode.id)
                .map((sourceNode: any) => (
                  <button
                    key={`${sourceNode.id}-${targetNode.id}-${targetNode.data.rootTriggerId}`}
                    data-testid={`drop-source-${sourceNode.id}-on-root-trigger-${targetNode.id}`}
                    data-trigger-drop-target="true"
                    data-interaction-id={targetNode.id}
                    data-trigger-id={targetNode.data.rootTriggerId}
                    onClick={(event) => {
                      onConnectStart?.(event, { nodeId: sourceNode.id, handleType: 'source' });
                      onConnectEnd?.(event, {
                        isValid: null,
                        toNode: null,
                        pointer: null,
                      });
                    }}
                  />
                )),
            )}
          {children}
        </div>
      );
    },
    useNodesState: (initialNodes: any[]) => {
      const [nodes, setNodes] = React.useState(initialNodes);
      return [nodes, setNodes, vi.fn()];
    },
    useEdgesState: (initialEdges: any[]) => {
      const [edges, setEdges] = React.useState(initialEdges);
      return [edges, setEdges, vi.fn()];
    },
  };
});

const baseStory: Story = {
  id: 'story-1',
  title: 'Test story',
  createdAt: '2026-07-14T08:00:00.000Z',
  updatedAt: '2026-07-14T08:00:00.000Z',
  access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
  capabilities: { canRead: true, canEdit: true, canManage: true, canComment: true },
  interactions: [
    {
      id: 'interaction-1',
      title: 'Original title',
      body: 'Original content',
      position: { x: 80, y: 120 },
      triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
    },
  ],
};

function cloneStory(story: Story = baseStory): Story {
  return structuredClone(story);
}

function interactionMutation(story: Story, interactionId: string): InteractionMutationResult {
  const interaction = story.interactions.find(({ id }) => id === interactionId);
  if (!interaction) throw new Error(`Missing interaction ${interactionId} in test fixture`);
  return {
    interaction: structuredClone(interaction),
    revision: story.revision ?? 2,
    updatedAt: story.updatedAt,
  };
}

function triggerMutation(
  story: Story,
  interactionId: string,
  triggerId: string,
): TriggerMutationResult {
  const trigger = story.interactions
    .find(({ id }) => id === interactionId)
    ?.triggers.find(({ id }) => id === triggerId);
  if (!trigger) throw new Error(`Missing trigger ${triggerId} in test fixture`);
  return {
    interactionId,
    trigger: structuredClone(trigger),
    revision: story.revision ?? 2,
    updatedAt: story.updatedAt,
  };
}

function graphDecorationMutation(
  story: Story,
  decorationId: string,
): GraphDecorationMutationResult {
  const decoration = story.graphDecorations?.find(({ id }) => id === decorationId);
  if (!decoration) throw new Error(`Missing graph decoration ${decorationId} in test fixture`);
  return {
    decoration: structuredClone(decoration),
    revision: story.revision ?? 2,
    updatedAt: story.updatedAt,
  };
}

function storyWithTwoInteractions(): Story {
  return {
    ...cloneStory(),
    interactions: [
      cloneStory().interactions[0],
      {
        id: 'interaction-2',
        title: 'Second interaction',
        body: 'Next content',
        position: { x: 80, y: 270 },
        triggers: [{ id: 'trigger-2', inputInteractionIds: ['interaction-1'], conditions: [] }],
      },
    ],
  };
}

function storyWithThreeInteractions(): Story {
  const story = storyWithTwoInteractions();
  story.interactions.push({
    id: 'interaction-3',
    title: 'Third interaction',
    body: 'Another child',
    position: { x: 320, y: 420 },
    triggers: [{ id: 'trigger-3', inputInteractionIds: [], conditions: [] }],
  });
  return story;
}

async function renderEditor(story: Story = baseStory) {
  vi.mocked(api.getStory).mockResolvedValue(cloneStory(story));

  render(
    <MemoryRouter initialEntries={['/stories/story-1/edit']}>
      <Routes>
        <Route path="/stories/:storyId/edit" element={<StoryEditor />} />
      </Routes>
    </MemoryRouter>,
  );

  await screen.findByText('Original title');
}

async function chooseTriggerConditionType(
  user: ReturnType<typeof userEvent.setup>,
  typeName: string,
) {
  const picker = screen.getByRole('group', { name: 'Condition type' });
  await user.click(within(picker).getByRole('button', { name: typeName }));
}

describe('StoryEditor', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    FakeEventSource.instances = [];
    window.localStorage.clear();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.listCommentThreads).mockResolvedValue([]);
  });

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

  it('redirects a commenter without edit permission to the reader', async () => {
    const reviewStory = cloneStory();
    reviewStory.capabilities = {
      canRead: true,
      canEdit: false,
      canManage: false,
      canComment: true,
    };
    vi.mocked(api.getStory).mockResolvedValue(reviewStory);
    render(
      <MemoryRouter initialEntries={['/stories/story-1/edit']}>
        <Routes>
          <Route path="/stories/:storyId/edit" element={<StoryEditor />} />
          <Route path="/stories/:storyId/play" element={<div>Reader route</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Reader route')).toBeInTheDocument();
    expect(api.listCommentThreads).not.toHaveBeenCalled();
    expect(screen.queryByTestId('react-flow')).not.toBeInTheDocument();
  });

  it('shows a loading error when the story cannot be loaded', async () => {
    vi.mocked(api.getStory).mockRejectedValue(new Error('Story not found'));

    render(
      <MemoryRouter initialEntries={['/stories/story-1/edit']}>
        <Routes>
          <Route path="/stories/:storyId/edit" element={<StoryEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Story not found')).toBeInTheDocument();
  });

  it('renames the story title', async () => {
    const user = userEvent.setup();
    const renamedStory = cloneStory();
    renamedStory.title = 'Renamed story';
    vi.mocked(api.renameStory).mockResolvedValue(renamedStory);

    await renderEditor();

    const storyTitleInput = screen.getByDisplayValue('Test story');
    await user.clear(storyTitleInput);
    await user.type(storyTitleInput, 'Renamed story');
    await user.tab();

    expect(api.renameStory).toHaveBeenCalledWith('story-1', 'Renamed story');
    expect(await screen.findByDisplayValue('Renamed story')).toBeInTheDocument();
  });

  it('updates the story start date and time', async () => {
    const updatedStory = cloneStory();
    updatedStory.startDateTime = '2026-07-27T09:30';
    vi.mocked(api.updateStory).mockResolvedValue(updatedStory);

    await renderEditor();

    const start = screen.getByLabelText('Story start date and time');
    fireEvent.change(start, { target: { value: '2026-07-27T09:30' } });
    fireEvent.blur(start);

    expect(api.updateStory).toHaveBeenCalledWith('story-1', {
      startDateTime: '2026-07-27T09:30',
    });
    expect(await screen.findByDisplayValue('2026-07-27T09:30')).toBeInTheDocument();
  });

  it('creates and edits a location from the location panel', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createLocation).mockResolvedValue({
      location: { id: 'location-1', name: 'New location', description: '' },
      revision: 2,
      updatedAt: baseStory.updatedAt,
    });
    vi.mocked(api.updateLocation)
      .mockResolvedValueOnce({
        location: { id: 'location-1', name: 'Harbor', description: '' },
        revision: 3,
        updatedAt: baseStory.updatedAt,
      })
      .mockResolvedValueOnce({
        location: { id: 'location-1', name: 'Harbor', description: 'A quiet harbor.' },
        revision: 4,
        updatedAt: baseStory.updatedAt,
      });

    await renderEditor();
    await user.click(screen.getByRole('button', { name: 'Add location' }));

    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    expect(within(inspector).getByRole('heading', { name: 'Items' })).toBeInTheDocument();
    const name = within(inspector).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Harbor');
    fireEvent.blur(name);
    const category = within(inspector).getByLabelText('Category');
    await user.type(category, 'Coastal places');
    fireEvent.blur(category);
    await waitFor(() =>
      expect(api.updateLocation).toHaveBeenCalledWith('story-1', 'location-1', {
        category: 'Coastal places',
      }),
    );
    const description = within(inspector).getByLabelText('Description');
    await user.clear(description);
    await user.type(description, 'A quiet harbor.');
    fireEvent.blur(description);

    await waitFor(() =>
      expect(api.updateLocation).toHaveBeenLastCalledWith('story-1', 'location-1', {
        description: 'A quiet harbor.',
      }),
    );
    expect(screen.getByRole('button', { name: 'Harbor' })).toBeInTheDocument();
  });

  it('assigns locations to interactions and trigger conditions', async () => {
    const user = userEvent.setup();
    const locatedStory = cloneStory();
    locatedStory.locations = [{ id: 'location-1', name: 'Harbor', description: '' }];
    const assignedStory = cloneStory(locatedStory);
    assignedStory.interactions[0].locationId = 'location-1';
    vi.mocked(api.updateInteraction).mockResolvedValue(
      interactionMutation(assignedStory, 'interaction-1'),
    );
    const conditionedStory = cloneStory(assignedStory);
    conditionedStory.interactions[0].triggers[0].conditions = [
      { locationId: 'location-1', isCurrentLocation: true },
    ];
    vi.mocked(api.updateTrigger).mockResolvedValue(
      triggerMutation(conditionedStory, 'interaction-1', 'trigger-1'),
    );

    await renderEditor(locatedStory);
    await user.click(screen.getByTestId('flow-node-interaction-1'));
    await user.selectOptions(screen.getByLabelText('Location'), 'location-1');
    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', {
      locationId: 'location-1',
    });

    await user.click(screen.getByRole('button', { name: 'Select root trigger' }));
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await chooseTriggerConditionType(user, 'Location');
    expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-1', 'trigger-1', {
      inputInteractionIds: [],
      conditions: [{ locationId: 'location-1', isCurrentLocation: true }],
    });
  });

  it('creates, edits, assigns, and conditions a character', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createCharacter).mockResolvedValue({
      character: { id: 'character-1', name: 'New character', description: '' },
      revision: 2,
      updatedAt: baseStory.updatedAt,
    });
    vi.mocked(api.updateCharacter).mockResolvedValue({
      character: { id: 'character-1', name: 'Mira', description: '' },
      revision: 3,
      updatedAt: baseStory.updatedAt,
    });

    await renderEditor();
    await user.click(screen.getByRole('button', { name: 'Add character' }));
    const inspector = screen.getByRole('complementary', { name: 'Inspector' });
    const name = within(inspector).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Mira');
    fireEvent.blur(name);
    const category = within(inspector).getByLabelText('Category');
    await user.type(category, 'Allies');
    fireEvent.blur(category);
    await waitFor(() =>
      expect(api.updateCharacter).toHaveBeenCalledWith('story-1', 'character-1', {
        category: 'Allies',
      }),
    );
    const description = within(inspector).getByLabelText('Description');
    await user.type(description, 'An investigator.');
    fireEvent.blur(description);
    await waitFor(() =>
      expect(api.updateCharacter).toHaveBeenCalledWith('story-1', 'character-1', {
        description: 'An investigator.',
      }),
    );
    expect(await screen.findByRole('button', { name: 'Mira' })).toBeInTheDocument();

    await user.click(screen.getByTestId('flow-node-interaction-1'));
    const assignedStory = cloneStory();
    assignedStory.characters = [{ id: 'character-1', name: 'Mira', description: '' }];
    assignedStory.interactions[0].characterIds = ['character-1'];
    vi.mocked(api.updateInteraction).mockResolvedValue(
      interactionMutation(assignedStory, 'interaction-1'),
    );
    await user.click(screen.getByRole('checkbox', { name: 'Mira' }));
    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', {
      characterIds: ['character-1'],
    });

    const conditionedStory = cloneStory(assignedStory);
    conditionedStory.interactions[0].triggers[0].conditions = [
      { characterId: 'character-1', isPresent: true },
    ];
    vi.mocked(api.updateTrigger).mockResolvedValue(
      triggerMutation(conditionedStory, 'interaction-1', 'trigger-1'),
    );
    await user.click(screen.getByRole('button', { name: 'Select root trigger' }));
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await chooseTriggerConditionType(user, 'Character');
    expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-1', 'trigger-1', {
      inputInteractionIds: [],
      conditions: [{ characterId: 'character-1', isPresent: true }],
    });
    await user.selectOptions(screen.getByLabelText('Character condition operator'), 'absent');
    expect(api.updateTrigger).toHaveBeenLastCalledWith('story-1', 'interaction-1', 'trigger-1', {
      inputInteractionIds: [],
      conditions: [{ characterId: 'character-1', isPresent: false }],
    });
  });

  it('creates a character stat and configures interaction effects and trigger comparisons', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createStatDefinition).mockResolvedValue({
      statDefinition: { id: 'definition-1', name: 'Trust' },
      revision: 2,
      updatedAt: baseStory.updatedAt,
    });
    vi.mocked(api.createCharacter).mockResolvedValue({
      character: { id: 'character-1', name: 'Mira', description: '', stats: [] },
      revision: 2,
      updatedAt: baseStory.updatedAt,
    });
    vi.mocked(api.createCharacterStat).mockResolvedValue({
      characterId: 'character-1',
      stat: { id: 'stat-1', statDefinitionId: 'definition-1', initialValue: 0 },
      revision: 4,
      updatedAt: baseStory.updatedAt,
    });
    vi.mocked(api.updateCharacterStat).mockResolvedValue({
      characterId: 'character-1',
      stat: { id: 'stat-1', statDefinitionId: 'definition-1', initialValue: 2 },
      revision: 5,
      updatedAt: baseStory.updatedAt,
    });

    await renderEditor();
    await user.click(screen.getByRole('button', { name: 'Add stat definition' }));
    const category = screen.getByLabelText('Category');
    await user.type(category, 'Relationships');
    fireEvent.blur(category);
    await waitFor(() =>
      expect(api.updateStatDefinition).toHaveBeenCalledWith('story-1', 'definition-1', {
        category: 'Relationships',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Add character' }));
    await user.click(screen.getByRole('button', { name: 'Add stat' }));
    expect(api.createCharacterStat).toHaveBeenCalledWith('story-1', 'character-1', {
      statDefinitionId: 'definition-1',
      initialValue: 0,
    });
    const initialValue = screen.getByLabelText('Initial value');
    await user.clear(initialValue);
    await user.type(initialValue, '2');
    fireEvent.blur(initialValue);
    expect(api.updateCharacterStat).toHaveBeenCalledWith('story-1', 'character-1', 'stat-1', {
      initialValue: 2,
    });

    await user.click(screen.getByTestId('flow-node-interaction-1'));
    const withEffect = cloneStory();
    withEffect.characters = [
      {
        id: 'character-1',
        name: 'Mira',
        description: '',
        stats: [{ id: 'stat-1', statDefinitionId: 'definition-1', initialValue: 0 }],
      },
    ];
    withEffect.statDefinitions = [{ id: 'definition-1', name: 'Trust' }];
    withEffect.interactions[0].statEffects = [{ statId: 'stat-1', operation: 'add', value: 1 }];
    vi.mocked(api.updateInteraction).mockResolvedValue(
      interactionMutation(withEffect, 'interaction-1'),
    );
    await user.click(screen.getByRole('button', { name: 'Add effect' }));
    await user.click(
      within(screen.getByRole('group', { name: 'Effect type' })).getByRole('button', {
        name: 'Character stat',
      }),
    );
    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', {
      statEffects: [{ statId: 'stat-1', operation: 'add', value: 1 }],
    });
    await user.selectOptions(screen.getByLabelText('Stat effect operation'), 'set');
    const effectValue = screen.getByLabelText('Stat effect value');
    await user.clear(effectValue);
    await user.type(effectValue, '4');
    fireEvent.blur(effectValue);
    await user.click(screen.getByRole('button', { name: 'Delete stat effect' }));

    const conditioned = cloneStory(withEffect);
    conditioned.interactions[0].triggers[0].conditions = [
      { statId: 'stat-1', operator: 'gte', value: 2 },
    ];
    vi.mocked(api.updateTrigger).mockResolvedValue(
      triggerMutation(conditioned, 'interaction-1', 'trigger-1'),
    );
    await user.click(screen.getByRole('button', { name: 'Select root trigger' }));
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await chooseTriggerConditionType(user, 'Character stat');
    expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-1', 'trigger-1', {
      inputInteractionIds: [],
      conditions: [{ statId: 'stat-1', operator: 'gte', value: 2 }],
    });
    await user.selectOptions(screen.getByLabelText('Stat condition operator'), 'lt');
    const comparisonValue = screen.getByLabelText('Stat condition value');
    await user.clear(comparisonValue);
    await user.type(comparisonValue, '5');
    await user.click(screen.getByRole('button', { name: 'x' }));
  });

  it('creates an item definition and gives separate copies to a character', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createItemDefinition).mockResolvedValue({
      itemDefinition: { id: 'item-definition-1', name: 'Key', description: 'A brass key.' },
      revision: 2,
      updatedAt: baseStory.updatedAt,
    });
    vi.mocked(api.updateItemDefinition).mockResolvedValue({
      itemDefinition: {
        id: 'item-definition-1',
        name: 'Archive key',
        description: 'A brass key.',
      },
      revision: 3,
      updatedAt: baseStory.updatedAt,
    });
    vi.mocked(api.createCharacter).mockResolvedValue({
      character: { id: 'character-1', name: 'Mira', description: '', items: [] },
      revision: 4,
      updatedAt: baseStory.updatedAt,
    });
    vi.mocked(api.createCharacterItem)
      .mockResolvedValueOnce({
        characterId: 'character-1',
        item: { id: 'item-1', itemDefinitionId: 'item-definition-1' },
        revision: 5,
        updatedAt: baseStory.updatedAt,
      })
      .mockResolvedValueOnce({
        characterId: 'character-1',
        item: { id: 'item-2', itemDefinitionId: 'item-definition-1' },
        revision: 6,
        updatedAt: baseStory.updatedAt,
      });

    await renderEditor();
    await user.click(screen.getByRole('button', { name: 'Add item definition' }));
    const itemName = screen.getByLabelText('Name');
    await user.clear(itemName);
    await user.type(itemName, 'Archive key');
    fireEvent.blur(itemName);
    expect(api.updateItemDefinition).toHaveBeenCalledWith('story-1', 'item-definition-1', {
      name: 'Archive key',
    });
    const category = screen.getByLabelText('Category');
    await user.type(category, 'Quest items');
    fireEvent.blur(category);
    await waitFor(() =>
      expect(api.updateItemDefinition).toHaveBeenCalledWith('story-1', 'item-definition-1', {
        category: 'Quest items',
      }),
    );
    const itemDescription = screen.getByLabelText('Description');
    await user.clear(itemDescription);
    await user.type(itemDescription, 'Opens the archive.');
    fireEvent.blur(itemDescription);
    expect(api.updateItemDefinition).toHaveBeenLastCalledWith('story-1', 'item-definition-1', {
      description: 'Opens the archive.',
    });

    await user.click(screen.getByRole('button', { name: 'Add character' }));
    await user.click(screen.getByRole('button', { name: 'Add item' }));
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    expect(api.createCharacterItem).toHaveBeenCalledTimes(2);
    expect(api.createCharacterItem).toHaveBeenNthCalledWith(1, 'story-1', 'character-1', {
      itemDefinitionId: 'item-definition-1',
    });
    expect(api.createCharacterItem).toHaveBeenNthCalledWith(2, 'story-1', 'character-1', {
      itemDefinitionId: 'item-definition-1',
    });
    expect(
      within(screen.getByRole('complementary', { name: 'Inspector' })).getAllByText('Archive key', {
        selector: 'strong',
      }),
    ).toHaveLength(2);
  });

  it('collapses each story context section and the whole navigation', async () => {
    const user = userEvent.setup();
    await renderEditor();

    for (const section of ['Locations', 'Characters', 'Stats', 'Items']) {
      const toggle = screen.getByRole('button', { name: new RegExp(section) });
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
    }

    await user.click(screen.getByRole('button', { name: 'Collapse story context' }));
    expect(screen.getByRole('button', { name: 'Expand story context' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expand story context' }));
    expect(screen.getByRole('button', { name: 'Collapse story context' })).toBeInTheDocument();
  });

  it('remembers the collapsed story context navigation across editor mounts', async () => {
    const user = userEvent.setup();
    await renderEditor();

    await user.click(screen.getByRole('button', { name: 'Collapse story context' }));
    await waitFor(() => {
      expect(window.localStorage.getItem('paralleax-story-context-panel')).toBe('collapsed');
    });

    cleanup();
    await renderEditor();

    expect(screen.getByRole('button', { name: 'Expand story context' })).toBeInTheDocument();
    expect(
      screen.queryByRole('searchbox', { name: 'Search story context and interactions' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Expand story context' }));
    await waitFor(() => {
      expect(window.localStorage.getItem('paralleax-story-context-panel')).toBe('open');
    });
  });

  it('summarizes real story references in compact context entity rows', async () => {
    const story = cloneStory();
    story.locations = [
      {
        id: 'harbor',
        name: 'Harbor',
        description: '',
        category: 'Coast',
        items: [{ id: 'harbor-key', itemDefinitionId: 'key' }],
      },
      { id: 'crossroads', name: 'Crossroads', description: '' },
    ];
    story.statDefinitions = [{ id: 'trust', name: 'Trust', category: 'Relationships' }];
    story.itemDefinitions = [
      { id: 'key', name: 'Archive key', description: '', category: 'Quest items' },
    ];
    story.characters = [
      {
        id: 'mira',
        name: 'Mira Vale',
        description: '',
        category: 'Allies',
        isPlayable: true,
        stats: [{ id: 'mira-trust', statDefinitionId: 'trust', initialValue: 3 }],
        items: [{ id: 'mira-key', itemDefinitionId: 'key' }],
      },
    ];
    story.interactions[0].locationId = 'harbor';
    story.interactions[0].characterIds = ['mira'];

    await renderEditor(story);

    const context = screen.getByRole('navigation', { name: 'Story context' });
    for (const category of ['Coast', 'Allies', 'Relationships', 'Quest items', 'Uncategorized']) {
      expect(within(context).getByText(category)).toBeInTheDocument();
    }
    expect(
      within(within(context).getByRole('button', { name: 'Harbor' })).getByText('1 interaction'),
    ).toBeInTheDocument();
    expect(
      within(within(context).getByRole('button', { name: 'Mira Vale' })).getByText(
        'Playable · 1 interaction',
      ),
    ).toBeInTheDocument();
    expect(
      within(within(context).getByRole('button', { name: 'Trust' })).getByText('1 assignment'),
    ).toBeInTheDocument();
    expect(
      within(within(context).getByRole('button', { name: 'Archive key' })).getByText('2 instances'),
    ).toBeInTheDocument();

    const interactionCard = within(screen.getByTestId('flow-node-interaction-1')).getByTestId(
      'interaction-node',
    );
    expect(within(interactionCard).getByText('Harbor')).toBeInTheDocument();
    expect(
      within(interactionCard).getByLabelText('Characters present: Mira Vale'),
    ).toBeInTheDocument();
  });

  it('filters context lists, counts text matches, navigates occurrences, and allows deeper zoom', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    story.locations = [
      { id: 'original-hall', name: 'Original Hall', description: '' },
      { id: 'harbor', name: 'Harbor', description: '', category: 'Coastal places' },
    ];
    story.characters = [
      { id: 'original-guide', name: 'Original Guide', description: '' },
      { id: 'mira', name: 'Mira', description: '' },
    ];

    await renderEditor(story);
    expect(screen.getByTestId('react-flow')).toHaveAttribute('data-min-zoom', '0.05');

    const search = screen.getByRole('searchbox', {
      name: 'Search story context and interactions',
    });
    await user.type(search, 'Original');

    expect(screen.getByRole('button', { name: 'Original Hall' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Harbor' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Original Guide' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mira' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('2 occurrences')).toBeInTheDocument();
    expect(screen.getByText('0 / 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next interaction occurrence' }));
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();

    await user.clear(search);
    await user.type(search, 'Coastal');
    expect(screen.getByRole('button', { name: 'Harbor' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Original Hall' })).not.toBeInTheDocument();
  });

  it('dims unrelated interactions and navigates references for a selected context entity', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    story.locations = [
      { id: 'harbor', name: 'Harbor', description: '' },
      { id: 'library', name: 'Library', description: '' },
    ];
    story.interactions[0].locationId = 'harbor';

    await renderEditor(story);
    await user.click(screen.getByRole('button', { name: 'Harbor' }));

    expect(
      within(screen.getByTestId('flow-node-interaction-1')).getByTestId('interaction-node'),
    ).not.toHaveClass('dimmed');
    expect(
      within(screen.getByTestId('flow-node-interaction-2')).getByTestId('interaction-node'),
    ).toHaveClass('dimmed');
    expect(screen.getByText('0 / 1')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next interaction occurrence' }));
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Harbor' })).toHaveClass('selected');
  });

  it('creates root and child interactions', async () => {
    const user = userEvent.setup();
    const rootPosition = getStoryGraphClickCreationPosition(baseStory, { kind: 'root' })!;
    const withRoot = cloneStory();
    withRoot.interactions.push({
      id: 'interaction-root',
      title: 'Created root',
      body: 'Root body',
      position: rootPosition,
      triggers: [{ id: 'trigger-root', inputInteractionIds: [], conditions: [] }],
    });
    const childPosition = getStoryGraphClickCreationPosition(withRoot, {
      kind: 'child',
      sourceId: 'interaction-1',
    })!;
    const withChild = storyWithTwoInteractions();
    withChild.interactions[1].position = childPosition;
    vi.mocked(api.createInteraction)
      .mockResolvedValueOnce(withRoot)
      .mockResolvedValueOnce(withChild);

    await renderEditor();

    await user.click(screen.getByRole('button', { name: 'Add root' }));
    expect(api.createInteraction).toHaveBeenCalledWith('story-1', { position: rootPosition });
    expect(await screen.findByText('Created root')).toBeInTheDocument();

    await user.click(
      within(screen.getByTestId('flow-node-interaction-1')).getByRole('button', {
        name: 'Create child interaction',
      }),
    );
    expect(api.createInteraction).toHaveBeenLastCalledWith('story-1', {
      parentId: 'interaction-1',
      position: childPosition,
    });
  });

  it('links the test action to the selected interaction when one is selected', async () => {
    const user = userEvent.setup();
    await renderEditor(storyWithTwoInteractions());

    const testLink = screen.getByRole('link', { name: 'Test' });
    expect(testLink).toHaveAttribute('href', '/stories/story-1/play?mode=simulation');

    await user.click(screen.getByTestId('flow-node-interaction-2'));

    expect(screen.getByRole('link', { name: 'Test from current interaction' })).toHaveAttribute(
      'href',
      '/stories/story-1/play?mode=simulation&startInteractionId=interaction-2',
    );
  });

  it('only reveals new trigger input handles while a connection is being created', async () => {
    await renderEditor(storyWithTwoInteractions());

    const hiddenHandles = screen.getAllByTitle('Create new trigger');
    expect(hiddenHandles.length).toBeGreaterThan(0);
    hiddenHandles.forEach((handle) => expect(handle).not.toHaveClass('is-visible'));

    await userEvent.click(screen.getByTestId('begin-source-interaction-1'));

    await waitFor(() => {
      screen
        .getAllByTitle('Create new trigger')
        .forEach((handle) => expect(handle).toHaveClass('is-visible'));
    });
  });

  it('creates a child interaction when a source connection is dropped on empty canvas', async () => {
    const story = storyWithTwoInteractions();
    const withNewChild = structuredClone(story);
    withNewChild.interactions.push({
      id: 'interaction-3',
      title: 'Dropped output',
      body: 'Created from source drop',
      position: { x: 420, y: 412 },
      triggers: [{ id: 'trigger-3', inputInteractionIds: ['interaction-1'], conditions: [] }],
    });
    vi.mocked(api.createInteraction).mockResolvedValue(withNewChild);

    await renderEditor(story);
    fireEvent.click(screen.getByTestId('drop-source-interaction-1'), {
      clientX: 580,
      clientY: 452,
    });

    await waitFor(() => {
      expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
        parentId: 'interaction-1',
        position: { x: 425, y: 412 },
      });
    });
  });

  it('creates a child interaction from the hovered node action', async () => {
    const position = getStoryGraphClickCreationPosition(baseStory, {
      kind: 'child',
      sourceId: 'interaction-1',
    })!;
    const withNewChild = storyWithTwoInteractions();
    withNewChild.interactions[1].position = position;
    vi.mocked(api.createInteraction).mockResolvedValue(withNewChild);

    await renderEditor();
    const node = screen.getByTestId('flow-node-interaction-1');
    await userEvent.click(within(node).getByRole('button', { name: 'Create child interaction' }));

    await waitFor(() => {
      expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
        parentId: 'interaction-1',
        position,
      });
    });
  });

  it('creates a parent interaction when a target connection is dropped on empty canvas', async () => {
    const story = storyWithTwoInteractions();
    const withParent = structuredClone(story);
    withParent.interactions.push({
      id: 'interaction-parent',
      title: 'Dropped input',
      body: 'Created from target drop',
      position: { x: 160, y: 172 },
      triggers: [{ id: 'trigger-parent', inputInteractionIds: [], conditions: [] }],
    });
    const withTrigger = structuredClone(withParent);
    withTrigger.interactions[1].triggers.push({
      id: 'trigger-new',
      inputInteractionIds: [],
      conditions: [],
    });
    const connectedStory = structuredClone(withTrigger);
    connectedStory.interactions[1].triggers[1].inputInteractionIds = ['interaction-parent'];
    vi.mocked(api.createInteraction).mockResolvedValue(withParent);
    vi.mocked(api.addTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    fireEvent.click(screen.getByTestId('drop-target-interaction-2'), {
      clientX: 320,
      clientY: 328,
    });

    await waitFor(() => {
      expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
        position: { x: 165, y: 172 },
      });
      expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', {
        inputInteractionIds: ['interaction-parent'],
        conditions: [],
      });
      expect(api.updateTrigger).not.toHaveBeenCalled();
    });
  });

  it('creates a parent interaction from the hovered node action', async () => {
    const story = storyWithTwoInteractions();
    const position = getStoryGraphClickCreationPosition(story, {
      kind: 'parent',
      targetId: 'interaction-2',
    })!;
    const withParent = structuredClone(story);
    withParent.interactions.push({
      id: 'interaction-parent',
      title: 'Created source',
      body: 'Source body',
      position,
      triggers: [{ id: 'trigger-parent', inputInteractionIds: [], conditions: [] }],
    });
    const withTrigger = structuredClone(withParent);
    withTrigger.interactions[1].triggers.push({
      id: 'trigger-new',
      inputInteractionIds: [],
      conditions: [],
    });
    const connectedStory = structuredClone(withTrigger);
    connectedStory.interactions[1].triggers[1].inputInteractionIds = ['interaction-parent'];
    vi.mocked(api.createInteraction).mockResolvedValue(withParent);
    vi.mocked(api.addTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    const node = screen.getByTestId('flow-node-interaction-2');
    await userEvent.click(within(node).getByRole('button', { name: 'Create source interaction' }));

    await waitFor(() => {
      expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
        position,
      });
      expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', {
        inputInteractionIds: ['interaction-parent'],
        conditions: [],
      });
      expect(api.updateTrigger).not.toHaveBeenCalled();
    });
  });

  it('places a new child interaction below occupied vertical outputs instead of overlapping them', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    story.interactions[1].position = { x: 80, y: 270 };
    const position = getStoryGraphClickCreationPosition(story, {
      kind: 'child',
      sourceId: 'interaction-1',
    })!;
    const withNewChild = structuredClone(story);
    withNewChild.interactions.push({
      id: 'interaction-3',
      title: 'New output',
      body: 'Additional output',
      position,
      triggers: [{ id: 'trigger-3', inputInteractionIds: ['interaction-1'], conditions: [] }],
    });
    vi.mocked(api.createInteraction).mockResolvedValue(withNewChild);

    await renderEditor(story);
    await user.click(
      within(screen.getByTestId('flow-node-interaction-1')).getByRole('button', {
        name: 'Create child interaction',
      }),
    );

    expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
      parentId: 'interaction-1',
      position,
    });
  });

  it('keeps the editor visible when an interaction title is edited', async () => {
    const user = userEvent.setup();
    const updatedStory = cloneStory();
    updatedStory.interactions[0].title = 'New title';
    vi.mocked(api.updateInteraction).mockResolvedValue(
      interactionMutation(updatedStory, 'interaction-1'),
    );

    await renderEditor();
    await user.click(screen.getByTestId('flow-node-interaction-1'));

    const titleInput = screen.getByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'New title');
    await user.tab();

    expect(await screen.findByDisplayValue('New title')).toBeInTheDocument();
    expect(screen.getByText('New title')).toBeInTheDocument();
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', {
      title: 'New title',
    });
  });

  it('updates interaction body from the inspector', async () => {
    const user = userEvent.setup();
    const updatedStory = cloneStory();
    updatedStory.interactions[0].body = 'Long new content';
    vi.mocked(api.updateInteraction).mockResolvedValue(updatedStory);

    await renderEditor();
    await user.click(screen.getByTestId('flow-node-interaction-1'));

    const bodyInput = screen.getByLabelText('Content');
    await user.clear(bodyInput);
    await user.type(bodyInput, 'Long new content');
    await user.tab();

    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', {
      body: 'Long new content',
    });
    await waitFor(() =>
      expect(screen.getByLabelText('Content')).toHaveTextContent('Long new content'),
    );
  });

  it('serializes title and body saves so reopening keeps both edits', async () => {
    let resolveTitleSave!: (story: Story) => void;
    let resolveBodySave!: (story: Story) => void;
    vi.mocked(api.updateInteraction)
      .mockImplementationOnce(() => new Promise<Story>((resolve) => (resolveTitleSave = resolve)))
      .mockImplementationOnce(() => new Promise<Story>((resolve) => (resolveBodySave = resolve)));

    await renderEditor();
    fireEvent.click(screen.getByTestId('flow-node-interaction-1'));

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Saved title' } });
    fireEvent.blur(screen.getByLabelText('Title'));
    const content = screen.getByLabelText('Content');
    content.innerHTML = 'Saved content';
    fireEvent.input(content);
    fireEvent.blur(content);

    await waitFor(() => expect(api.updateInteraction).toHaveBeenCalledTimes(1));
    expect(screen.getByRole('status', { name: 'Story save status' })).toHaveTextContent('Saving…');
    expect(api.updateInteraction).toHaveBeenNthCalledWith(1, 'story-1', 'interaction-1', {
      title: 'Saved title',
    });

    const titleStory = cloneStory();
    titleStory.interactions[0].title = 'Saved title';
    await act(async () => resolveTitleSave(titleStory));

    await waitFor(() => expect(api.updateInteraction).toHaveBeenCalledTimes(2));
    expect(api.updateInteraction).toHaveBeenNthCalledWith(2, 'story-1', 'interaction-1', {
      body: 'Saved content',
    });

    const fullySavedStory = cloneStory();
    fullySavedStory.interactions[0].title = 'Saved title';
    fullySavedStory.interactions[0].body = 'Saved content';
    await act(async () => resolveBodySave(fullySavedStory));

    expect(await screen.findByDisplayValue('Saved title')).toBeInTheDocument();
    expect(screen.getByLabelText('Content')).toHaveTextContent('Saved content');
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('shows a recoverable error when an interaction save fails', async () => {
    const user = userEvent.setup();
    vi.mocked(api.updateInteraction).mockRejectedValueOnce(new Error('Database unavailable'));

    await renderEditor();
    await user.click(screen.getByTestId('flow-node-interaction-1'));
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Unsaved title');
    await user.tab();

    expect(await screen.findByRole('alert')).toHaveTextContent('Database unavailable');
    expect(screen.getByRole('status', { name: 'Story save status' })).toHaveTextContent(
      'Save failed',
    );

    await user.click(screen.getByRole('button', { name: 'Reload story' }));
    await waitFor(() => expect(api.getStory).toHaveBeenCalledTimes(2));
  });

  it('does not erase title or body when a drag save only returns a position update', async () => {
    const movedStory = cloneStory();
    movedStory.interactions[0].position = { x: 105, y: 135 };
    vi.mocked(api.updateInteraction).mockResolvedValue(movedStory);

    await renderEditor();

    const flowNode = screen.getByTestId('flow-node-interaction-1');
    await userEvent.click(screen.getByTestId('drag-node-interaction-1'));

    await waitFor(() => {
      expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', {
        position: { x: 105, y: 135 },
      });
    });

    const interactionNode = within(flowNode).getByTestId('interaction-node');
    expect(within(interactionNode).getByText('Original title')).toBeInTheDocument();
    expect(within(interactionNode).getByText('Original content')).toBeInTheDocument();
  });

  it('does not erase other interactions when one interaction is moved', async () => {
    const story = storyWithTwoInteractions();
    const staleMovedStory = structuredClone(story);
    staleMovedStory.interactions[0].position = { x: 105, y: 135 };
    staleMovedStory.interactions[1].title = '';
    staleMovedStory.interactions[1].body = '';
    vi.mocked(api.updateInteraction).mockResolvedValue(staleMovedStory);

    await renderEditor(story);

    const otherNode = screen.getByTestId('flow-node-interaction-2');
    await userEvent.click(screen.getByTestId('drag-node-interaction-1'));

    await waitFor(() => {
      expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', {
        position: { x: 105, y: 135 },
      });
    });

    const otherInteractionNode = within(otherNode).getByTestId('interaction-node');
    expect(within(otherInteractionNode).getByText('Second interaction')).toBeInTheDocument();
    expect(within(otherInteractionNode).getByText('Next content')).toBeInTheDocument();
  });

  it('saves a linked trigger position when its graph marker is moved', async () => {
    const story = storyWithTwoInteractions();
    story.interactions[1].triggers[0].position = { x: 400, y: 300 };
    const movedStory = structuredClone(story);
    movedStory.interactions[1].triggers[0].position = { x: 425, y: 315 };
    vi.mocked(api.updateTrigger).mockResolvedValue(
      triggerMutation(movedStory, 'interaction-2', 'trigger-2'),
    );

    await renderEditor(story);
    expect(screen.getByTestId('flow-trigger-interaction-2-trigger-2')).not.toHaveClass('nodrag');
    await userEvent.click(screen.getByTestId('drag-node-trigger:interaction-2:trigger-2'));

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        position: { x: 425, y: 315 },
      });
    });
  });

  it('moves every trigger variant represented by one grouped marker', async () => {
    const story = storyWithTwoInteractions();
    story.interactions[1].triggers[0].position = { x: 400, y: 300 };
    story.interactions[1].triggers.push({
      id: 'trigger-variant',
      inputInteractionIds: ['interaction-1'],
      conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
      position: { x: 400, y: 300 },
    });
    const movedStory = structuredClone(story);
    movedStory.interactions[1].triggers.forEach((trigger) => {
      trigger.position = { x: 425, y: 315 };
    });
    vi.mocked(api.updateTrigger).mockImplementation(async (_storyId, interactionId, triggerId) =>
      triggerMutation(movedStory, interactionId, triggerId),
    );

    await renderEditor(story);
    await userEvent.click(screen.getByTestId('drag-node-trigger:interaction-2:trigger-2'));

    await waitFor(() => expect(api.updateTrigger).toHaveBeenCalledTimes(2));
    expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
      position: { x: 425, y: 315 },
    });
    expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-variant', {
      position: { x: 425, y: 315 },
    });
  });

  it('deletes the selected interaction', async () => {
    const user = userEvent.setup();
    const afterDelete = cloneStory();
    afterDelete.interactions = [];
    vi.mocked(api.deleteInteraction).mockResolvedValue(afterDelete);

    await renderEditor();
    await user.click(screen.getByTestId('flow-node-interaction-1'));
    await user.click(screen.getByRole('button', { name: 'Delete interaction' }));

    expect(api.deleteInteraction).toHaveBeenCalledWith('story-1', 'interaction-1');
    await waitFor(() => {
      expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();
    });
  });

  it('keeps an interaction when deletion is not confirmed', async () => {
    const user = userEvent.setup();
    vi.mocked(window.confirm).mockReturnValueOnce(false);

    await renderEditor();
    await user.click(screen.getByTestId('flow-node-interaction-1'));
    await user.click(screen.getByRole('button', { name: 'Delete interaction' }));

    expect(window.confirm).toHaveBeenCalled();
    expect(api.deleteInteraction).not.toHaveBeenCalled();
    expect(screen.getByTestId('flow-node-interaction-1')).toBeInTheDocument();
  });

  it('persists a canvas connection as a trigger input', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    const withTrigger = structuredClone(story);
    withTrigger.interactions[2].triggers.push({
      id: 'trigger-new',
      inputInteractionIds: [],
      conditions: [],
    });
    const connectedStory = structuredClone(withTrigger);
    connectedStory.interactions[2].triggers[1].inputInteractionIds = ['interaction-1'];
    vi.mocked(api.addTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('connect-interaction-1-interaction-3'));
    await user.click(await screen.findByRole('button', { name: 'Create a new trigger' }));

    await waitFor(() => {
      expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-3', {
        inputInteractionIds: ['interaction-1'],
        conditions: [],
      });
      expect(api.updateTrigger).not.toHaveBeenCalled();
    });
    expect(await screen.findByTestId('flow-edge-interaction-1-interaction-3')).toBeInTheDocument();
  });

  it('creates a trigger before persisting a canvas connection when the target has none', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    story.interactions[1].triggers = [];
    const withTrigger = structuredClone(story);
    withTrigger.interactions[1].triggers = [
      { id: 'trigger-new', inputInteractionIds: [], conditions: [] },
    ];
    const connectedStory = structuredClone(withTrigger);
    connectedStory.interactions[1].triggers[0].inputInteractionIds = ['interaction-1'];
    vi.mocked(api.addTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('connect-interaction-1-interaction-2'));

    await waitFor(() => {
      expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', {
        inputInteractionIds: ['interaction-1'],
        conditions: [],
      });
      expect(api.updateTrigger).not.toHaveBeenCalled();
    });
    expect(await screen.findByTestId('flow-edge-interaction-1-interaction-2')).toBeInTheDocument();
  });

  it('creates a dedicated trigger for a new canvas connection without changing existing linked triggers', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[2].triggers = [
      {
        id: 'trigger-existing',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
      },
    ];
    const withNewTrigger = structuredClone(story);
    withNewTrigger.interactions[2].triggers.push({
      id: 'trigger-new',
      inputInteractionIds: [],
      conditions: [],
    });
    const connectedStory = structuredClone(withNewTrigger);
    connectedStory.interactions[2].triggers[1].inputInteractionIds = ['interaction-2'];
    vi.mocked(api.addTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('connect-interaction-2-interaction-3'));
    await user.click(await screen.findByRole('button', { name: 'Create a new trigger' }));

    await waitFor(() => {
      expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-3', {
        inputInteractionIds: ['interaction-2'],
        conditions: [],
      });
      expect(api.updateTrigger).not.toHaveBeenCalled();
    });
    expect(await screen.findByTestId('flow-edge-interaction-1-interaction-3')).toBeInTheDocument();
    expect(await screen.findByTestId('flow-edge-interaction-2-interaction-3')).toBeInTheDocument();
  });

  it('can add a canvas connection to an existing trigger from the connection choice', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    const connectedStory = structuredClone(story);
    connectedStory.interactions[1].triggers[0].inputInteractionIds.push('interaction-3');
    vi.mocked(api.updateTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('connect-interaction-3-interaction-2'));
    expect(await screen.findByRole('dialog', { name: 'Connect interactions' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add to condition group 1' }));

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        inputInteractionIds: ['interaction-1', 'interaction-3'],
        conditions: [],
      });
    });
    expect(api.addTrigger).not.toHaveBeenCalled();
    expect(await screen.findByTestId('flow-edge-interaction-3-interaction-2')).toBeInTheDocument();
  });

  it('adds a source to an existing trigger when the connection is dropped on its marker', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[1].triggers[0].conditions = [
      { interactionId: 'interaction-1', hasBeenVisited: true },
    ];
    const connectedStory = structuredClone(story);
    connectedStory.interactions[1].triggers[0].inputInteractionIds = [
      'interaction-1',
      'interaction-3',
    ];
    vi.mocked(api.updateTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('drop-source-interaction-3-on-trigger-interaction-2'));

    await waitFor(() => {
      expect(api.addTrigger).not.toHaveBeenCalled();
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        inputInteractionIds: ['interaction-1', 'interaction-3'],
        conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
      });
    });
    expect(screen.getByTestId('flow-edge-interaction-1-interaction-2')).toBeInTheDocument();
    expect(await screen.findByTestId('flow-edge-interaction-3-interaction-2')).toBeInTheDocument();
  });

  it('turns a root trigger into a linked trigger when a connection is dropped on its marker', async () => {
    const story = storyWithTwoInteractions();
    const linkedRoot = structuredClone(story);
    linkedRoot.interactions[0].triggers[0].inputInteractionIds = ['interaction-2'];
    vi.mocked(api.updateTrigger).mockResolvedValue(linkedRoot);

    await renderEditor(story);
    fireEvent.click(screen.getByTestId('drop-source-interaction-2-on-root-trigger-interaction-1'));

    await waitFor(() => {
      expect(api.addTrigger).not.toHaveBeenCalled();
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-1', 'trigger-1', {
        inputInteractionIds: ['interaction-2'],
        conditions: [],
      });
    });
    expect(await screen.findByTestId('flow-edge-interaction-2-interaction-1')).toBeInTheDocument();
  });

  it('does not restore a deleted link when another canvas connection is created from that interaction', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[2].triggers = [];
    const withoutRootLink = structuredClone(story);
    withoutRootLink.interactions[1].triggers[0].inputInteractionIds = [];
    const staleWithNewTrigger = structuredClone(story);
    staleWithNewTrigger.interactions[2].triggers = [
      { id: 'trigger-new', inputInteractionIds: [], conditions: [] },
    ];
    const staleConnectedStory = structuredClone(staleWithNewTrigger);
    staleConnectedStory.interactions[2].triggers[0].inputInteractionIds = ['interaction-2'];
    vi.mocked(api.addTrigger).mockResolvedValue(
      triggerMutation(staleConnectedStory, 'interaction-3', 'trigger-new'),
    );
    vi.mocked(api.updateTrigger).mockResolvedValueOnce(withoutRootLink);

    await renderEditor(story);
    await user.click(screen.getByTestId('delete-link-interaction-1-interaction-2'));

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        inputInteractionIds: [],
        conditions: [],
      });
    });
    expect(screen.queryByTestId('flow-edge-interaction-1-interaction-2')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('connect-interaction-2-interaction-3'));

    await waitFor(() => {
      expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-3', {
        inputInteractionIds: ['interaction-2'],
        conditions: [],
      });
    });
    expect(screen.queryByTestId('flow-edge-interaction-1-interaction-2')).not.toBeInTheDocument();
    expect(await screen.findByTestId('flow-edge-interaction-2-interaction-3')).toBeInTheDocument();
  });

  it('opens the trigger editor from a marker and updates that trigger conditions', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[2].triggers = [
      { id: 'trigger-start', inputInteractionIds: [], conditions: [] },
      { id: 'trigger-edge', inputInteractionIds: ['interaction-1'], conditions: [] },
    ];
    const withCondition = structuredClone(story);
    withCondition.interactions[2].triggers[1].conditions = [
      { interactionId: 'interaction-1', hasBeenVisited: true },
    ];
    vi.mocked(api.updateTrigger).mockResolvedValue(withCondition);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-trigger-interaction-3-trigger-edge'));

    expect(screen.getByTestId('flow-trigger-interaction-3-trigger-edge')).toHaveClass('selected');
    expect(screen.getByRole('heading', { name: 'Path conditions' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await chooseTriggerConditionType(user, 'Interaction');

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-3', 'trigger-edge', {
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
      });
    });
  });

  it('keeps local interaction content when a trigger save returns stale interaction data', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const staleUpdatedStory = structuredClone(story);
    staleUpdatedStory.interactions[0].title = '';
    staleUpdatedStory.interactions[0].body = '';
    staleUpdatedStory.interactions[0].position = { x: 0, y: 0 };
    staleUpdatedStory.interactions[1].triggers[0].conditions = [
      { interactionId: 'interaction-1', hasBeenVisited: true },
    ];
    staleUpdatedStory.interactions[1].title = '';
    staleUpdatedStory.interactions[1].body = '';
    staleUpdatedStory.interactions[1].position = { x: 0, y: 0 };
    vi.mocked(api.updateTrigger).mockResolvedValue(staleUpdatedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-2'));
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await chooseTriggerConditionType(user, 'Interaction');

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
      });
    });

    const firstNode = within(screen.getByTestId('flow-node-interaction-1')).getByTestId(
      'interaction-node',
    );
    const secondNode = within(screen.getByTestId('flow-node-interaction-2')).getByTestId(
      'interaction-node',
    );
    expect(within(firstNode).getByText('Original title')).toBeInTheDocument();
    expect(within(firstNode).getByText('Original content')).toBeInTheDocument();
    expect(within(secondNode).getByText('Second interaction')).toBeInTheDocument();
    expect(within(secondNode).getByText('Next content')).toBeInTheDocument();
  });

  it('merges a delayed trigger save into the latest local editor state', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    let resolveTriggerSave: (story: Story) => void = () => {};
    vi.mocked(api.updateTrigger).mockReturnValue(
      new Promise((resolve) => {
        resolveTriggerSave = resolve;
      }),
    );

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-2'));
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await chooseTriggerConditionType(user, 'Interaction');
    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
      });
    });

    await user.click(screen.getByTestId('flow-node-interaction-2'));
    const titleInput = screen.getByLabelText('Title');
    fireEvent.change(titleInput, { target: { value: 'Fresh second title' } });

    const staleUpdatedStory = structuredClone(story);
    staleUpdatedStory.interactions[1].triggers[0].conditions = [
      { interactionId: 'interaction-1', hasBeenVisited: true },
    ];
    staleUpdatedStory.interactions[1].title = '';
    staleUpdatedStory.interactions[1].body = '';

    await act(async () => {
      resolveTriggerSave(staleUpdatedStory);
    });

    const secondNode = within(screen.getByTestId('flow-node-interaction-2')).getByTestId(
      'interaction-node',
    );
    expect(within(secondNode).getByText('Fresh second title')).toBeInTheDocument();
    expect(within(secondNode).getByText('Next content')).toBeInTheDocument();
  });

  it('renders several graph links for the same multi-input trigger', async () => {
    const story = storyWithThreeInteractions();
    story.interactions[2].triggers[0].inputInteractionIds = ['interaction-1', 'interaction-2'];

    await renderEditor(story);

    expect(screen.getByTestId('flow-edge-interaction-1-interaction-3')).toBeInTheDocument();
    expect(screen.getByTestId('flow-edge-interaction-2-interaction-3')).toBeInTheDocument();
    expect(screen.getByTestId('flow-trigger-interaction-3-trigger-3')).toBeInTheDocument();
  });

  it('groups duplicate trigger links and shows OR variants in the trigger inspector', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[1].triggers = [
      {
        id: 'trigger-a',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-3', hasBeenVisited: true }],
      },
      {
        id: 'trigger-b',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-3', hasBeenVisited: false }],
      },
    ];

    await renderEditor(story);

    expect(screen.getAllByTestId(/^flow-trigger-interaction-2-/)).toHaveLength(1);

    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-a'));

    expect(screen.getByText('Condition group 1')).toBeInTheDocument();
    expect(screen.getByText('Condition group 2')).toBeInTheDocument();
    expect(screen.getByText('OR')).toHaveClass('or-divider');
    const deleteGroupButtons = screen.getAllByRole('button', { name: 'Delete this OR group' });
    expect(deleteGroupButtons).toHaveLength(2);
    expect(deleteGroupButtons[0]).toHaveTextContent('×');
    expect(screen.getByRole('button', { name: 'Delete all OR groups' })).toHaveClass(
      'trigger-delete-action',
    );
  });

  it('deletes one OR condition group from the trigger inspector', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[1].triggers = [
      {
        id: 'trigger-a',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-3', hasBeenVisited: true }],
      },
      {
        id: 'trigger-b',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-3', hasBeenVisited: false }],
      },
    ];
    const withoutFirstGroup = structuredClone(story);
    withoutFirstGroup.interactions[1].triggers = [withoutFirstGroup.interactions[1].triggers[1]];
    vi.mocked(api.deleteTrigger).mockResolvedValue(withoutFirstGroup);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-a'));
    await user.click(screen.getAllByRole('button', { name: 'Delete this OR group' })[0]);

    await waitFor(() => {
      expect(api.deleteTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-a');
    });
    expect(window.confirm).not.toHaveBeenCalled();
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Path conditions' })).toBeInTheDocument();
    expect(screen.getByTestId('flow-trigger-interaction-2-trigger-b')).toHaveClass('selected');
  });

  it('deletes all OR condition groups from the trigger inspector', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[1].triggers = [
      {
        id: 'trigger-a',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-3', hasBeenVisited: true }],
      },
      {
        id: 'trigger-b',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-3', hasBeenVisited: false }],
      },
    ];
    const afterFirstDelete = structuredClone(story);
    afterFirstDelete.interactions[1].triggers = [afterFirstDelete.interactions[1].triggers[1]];
    const afterSecondDelete = structuredClone(afterFirstDelete);
    afterSecondDelete.interactions[1].triggers[0].inputInteractionIds = [];
    vi.mocked(api.deleteTrigger)
      .mockResolvedValueOnce(afterFirstDelete)
      .mockResolvedValueOnce(afterSecondDelete);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-a'));
    await user.click(screen.getByRole('button', { name: 'Delete all OR groups' }));

    await waitFor(() => {
      expect(api.deleteTrigger).toHaveBeenNthCalledWith(1, 'story-1', 'interaction-2', 'trigger-a');
      expect(api.deleteTrigger).toHaveBeenNthCalledWith(2, 'story-1', 'interaction-2', 'trigger-b');
    });
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();
  });

  it('deletes only the selected OR visual route when another trigger uses different inputs', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[1].triggers = [
      {
        id: 'trigger-a',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-3', hasBeenVisited: true }],
      },
      {
        id: 'trigger-b',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-3', hasBeenVisited: false }],
      },
      {
        id: 'trigger-c',
        inputInteractionIds: ['interaction-3'],
        conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
      },
    ];
    const afterFirstDelete = structuredClone(story);
    afterFirstDelete.interactions[1].triggers = [
      afterFirstDelete.interactions[1].triggers[1],
      afterFirstDelete.interactions[1].triggers[2],
    ];
    const afterSecondDelete = structuredClone(afterFirstDelete);
    afterSecondDelete.interactions[1].triggers = [afterSecondDelete.interactions[1].triggers[1]];
    vi.mocked(api.deleteTrigger)
      .mockResolvedValueOnce(afterFirstDelete)
      .mockResolvedValueOnce(afterSecondDelete);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-a'));
    await user.click(screen.getByRole('button', { name: 'Delete all OR groups' }));

    await waitFor(() => {
      expect(api.deleteTrigger).toHaveBeenNthCalledWith(1, 'story-1', 'interaction-2', 'trigger-a');
      expect(api.deleteTrigger).toHaveBeenNthCalledWith(2, 'story-1', 'interaction-2', 'trigger-b');
    });
    expect(api.deleteTrigger).not.toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-c');
    expect(screen.getByTestId('flow-trigger-interaction-2-trigger-c')).toBeInTheDocument();
    expect(screen.getByTestId('flow-edge-interaction-3-interaction-2')).toBeInTheDocument();
  });

  it('adds an OR condition group from the trigger inspector', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    const withOrGroup = structuredClone(story);
    withOrGroup.interactions[1].triggers.push({
      id: 'trigger-or',
      inputInteractionIds: ['interaction-1'],
      conditions: [],
    });
    vi.mocked(api.addTrigger).mockResolvedValue(withOrGroup);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-2'));
    const addGroupButton = screen.getByRole('button', { name: 'Add OR condition group' });
    expect(addGroupButton).toHaveTextContent('+');
    expect(addGroupButton).toHaveClass('trigger-add-group');
    await user.click(addGroupButton);

    await waitFor(() => {
      expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', {
        inputInteractionIds: ['interaction-1'],
        conditions: [],
      });
      expect(api.updateTrigger).not.toHaveBeenCalled();
    });
    expect(await screen.findByText('OR')).toHaveClass('or-divider');
    expect(screen.getByText('Condition group 2')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Condition type' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Condition interaction')).not.toBeInTheDocument();
  });

  it('does not allow adding an OR condition group to a root trigger', async () => {
    const user = userEvent.setup();
    await renderEditor(storyWithTwoInteractions());

    await user.click(
      within(screen.getByTestId('flow-node-interaction-1')).getByRole('button', {
        name: 'Select root trigger',
      }),
    );

    expect(screen.getByRole('button', { name: 'Add OR condition group' })).toBeDisabled();
  });

  it('adds, edits, and removes trigger conditions', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const withCondition = structuredClone(story);
    withCondition.interactions[0].triggers[0].conditions = [
      { interactionId: 'interaction-2', hasBeenVisited: true },
    ];
    const notVisitedCondition = structuredClone(story);
    notVisitedCondition.interactions[0].triggers[0].conditions = [
      { interactionId: 'interaction-2', hasBeenVisited: false },
    ];
    const withoutCondition = structuredClone(story);

    vi.mocked(api.updateTrigger)
      .mockResolvedValueOnce(withCondition)
      .mockResolvedValueOnce(notVisitedCondition)
      .mockResolvedValueOnce(withoutCondition);

    await renderEditor(story);
    await user.click(
      within(screen.getByTestId('flow-node-interaction-1')).getByRole('button', {
        name: 'Select root trigger',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Add condition' }));
    await chooseTriggerConditionType(user, 'Interaction');

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenLastCalledWith('story-1', 'interaction-1', 'trigger-1', {
        inputInteractionIds: [],
        conditions: [{ interactionId: 'interaction-2', hasBeenVisited: true }],
      });
    });

    await screen.findByDisplayValue('has been visited');
    await user.selectOptions(screen.getByDisplayValue('has been visited'), 'not-visited');
    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenLastCalledWith('story-1', 'interaction-1', 'trigger-1', {
        inputInteractionIds: [],
        conditions: [{ interactionId: 'interaction-2', hasBeenVisited: false }],
      });
    });

    await user.click(screen.getByRole('button', { name: 'x' }));
    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenLastCalledWith('story-1', 'interaction-1', 'trigger-1', {
        inputInteractionIds: [],
        conditions: [],
      });
    });
  });

  it('keeps trigger conditions out of the interaction inspector', async () => {
    const story = storyWithTwoInteractions();

    await renderEditor(story);
    await userEvent.click(screen.getByTestId('flow-node-interaction-2'));

    expect(screen.queryByRole('heading', { name: 'Path conditions' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Second interaction');
  });

  it('only shows the inspector while an interaction or trigger is selected', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();

    await renderEditor(story);

    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();

    await user.click(screen.getByTestId('flow-node-interaction-1'));
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Original title');

    await user.click(screen.getByRole('button', { name: 'Close inspector' }));
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();

    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-2'));
    expect(screen.getByRole('complementary', { name: 'Inspector' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Path conditions' })).toBeInTheDocument();

    await user.click(screen.getByTestId('flow-pane'));
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();
  });

  it('edits root trigger conditions from the root trigger marker', async () => {
    await renderEditor();
    await userEvent.click(
      within(screen.getByTestId('flow-node-interaction-1')).getByRole('button', {
        name: 'Select root trigger',
      }),
    );

    expect(screen.getByRole('heading', { name: 'Path conditions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete trigger' })).toHaveClass(
      'trigger-delete-action',
    );
  });

  it('turns the last linked trigger into a root trigger when deleting the trigger', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const rootTriggerStory = structuredClone(story);
    rootTriggerStory.interactions[1].triggers[0].inputInteractionIds = [];
    vi.mocked(api.deleteTrigger).mockResolvedValue(rootTriggerStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-2'));
    await user.click(screen.getByRole('button', { name: 'Delete trigger' }));

    await waitFor(() => {
      expect(api.deleteTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2');
    });
    expect(screen.queryByTestId('flow-edge-interaction-1-interaction-2')).not.toBeInTheDocument();
  });

  it('removes a link and keeps the trigger as a root trigger', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const withoutInput = structuredClone(story);
    withoutInput.interactions[1].triggers[0].inputInteractionIds = [];
    vi.mocked(api.updateTrigger).mockResolvedValue(withoutInput);

    await renderEditor(story);
    await user.click(screen.getByTestId('delete-link-interaction-1-interaction-2'));

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        inputInteractionIds: [],
        conditions: [],
      });
    });
    expect(api.deleteTrigger).not.toHaveBeenCalled();
    expect(screen.queryByTestId('flow-edge-interaction-1-interaction-2')).not.toBeInTheDocument();
  });

  it('deletes only the selected input link when a trigger has several inputs', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[1].triggers[0].inputInteractionIds = ['interaction-1', 'interaction-3'];
    const withoutSelectedInput = structuredClone(story);
    withoutSelectedInput.interactions[1].triggers[0].inputInteractionIds = ['interaction-3'];
    vi.mocked(api.updateTrigger).mockResolvedValue(withoutSelectedInput);

    await renderEditor(story);
    await user.click(screen.getByTestId('delete-link-interaction-1-interaction-2'));

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        inputInteractionIds: ['interaction-3'],
        conditions: [],
      });
    });
    expect(api.deleteTrigger).not.toHaveBeenCalled();
    expect(screen.queryByTestId('flow-edge-interaction-1-interaction-2')).not.toBeInTheDocument();
    expect(screen.getByTestId('flow-edge-interaction-3-interaction-2')).toBeInTheDocument();
  });

  it('deletes the selected input link from every OR trigger variant behind a grouped edge', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[1].triggers = [
      {
        id: 'trigger-a',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-3', hasBeenVisited: true }],
      },
      {
        id: 'trigger-b',
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-3', hasBeenVisited: false }],
      },
    ];
    const afterFirstInputDelete = structuredClone(story);
    afterFirstInputDelete.interactions[1].triggers[0].inputInteractionIds = [];
    const afterSecondInputDelete = structuredClone(afterFirstInputDelete);
    afterSecondInputDelete.interactions[1].triggers[1].inputInteractionIds = [];
    vi.mocked(api.updateTrigger)
      .mockResolvedValueOnce(afterFirstInputDelete)
      .mockResolvedValueOnce(afterSecondInputDelete);

    await renderEditor(story);
    await user.click(screen.getByTestId('delete-link-interaction-1-interaction-2'));

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-a', {
        inputInteractionIds: [],
        conditions: [{ interactionId: 'interaction-3', hasBeenVisited: true }],
      });
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-b', {
        inputInteractionIds: [],
        conditions: [{ interactionId: 'interaction-3', hasBeenVisited: false }],
      });
    });
    expect(screen.queryByTestId('flow-edge-interaction-1-interaction-2')).not.toBeInTheDocument();
  });

  it('does not restore a deleted link when a later interaction move returns stale trigger data', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const withoutLink = structuredClone(story);
    withoutLink.interactions[1].triggers[0].inputInteractionIds = [];
    const staleMovedStory = structuredClone(story);
    staleMovedStory.interactions[1].position = { x: 105, y: 285 };
    let resolveLinkDeletion: (story: Story) => void = () => {};
    vi.mocked(api.updateTrigger).mockReturnValue(
      new Promise((resolve) => {
        resolveLinkDeletion = resolve;
      }),
    );
    vi.mocked(api.updateInteraction).mockResolvedValue(staleMovedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('delete-link-interaction-1-interaction-2'));

    expect(screen.queryByTestId('flow-edge-interaction-1-interaction-2')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('drag-node-interaction-2'));

    await waitFor(() => {
      expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-2', {
        position: { x: 105, y: 285 },
      });
    });
    expect(screen.queryByTestId('flow-edge-interaction-1-interaction-2')).not.toBeInTheDocument();

    await act(async () => {
      resolveLinkDeletion(withoutLink);
    });
  });

  it('does not render a blank page when the selected interaction has no trigger', async () => {
    const storyWithoutTrigger = cloneStory();
    storyWithoutTrigger.interactions[0].triggers = [];

    await renderEditor(storyWithoutTrigger);
    await userEvent.click(screen.getByTestId('flow-node-interaction-1'));

    expect(screen.getByLabelText('Title')).toHaveValue('Original title');
    expect(screen.getByRole('button', { name: 'Delete interaction' })).toBeInTheDocument();
  });
});
