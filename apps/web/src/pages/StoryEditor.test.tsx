import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import { StoryEditor } from './StoryEditor';
import { api } from '../api';

vi.mock('../api', () => ({
  api: {
    getStory: vi.fn(),
    createInteraction: vi.fn(),
    updateInteraction: vi.fn(),
    deleteInteraction: vi.fn(),
    renameStory: vi.fn(),
    addTrigger: vi.fn(),
    updateTrigger: vi.fn(),
    deleteTrigger: vi.fn(),
  },
}));

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
    Position: { Bottom: 'bottom', Left: 'left', Right: 'right', Top: 'top' },
    ReactFlow: ({
      nodes,
      edges,
      nodeTypes,
      onInit,
      onConnect,
      onConnectStart,
      onConnectEnd,
      onNodeClick,
      onPaneClick,
      onNodeDragStop,
      children,
    }: any) => {
      const onInitRef = React.useRef(onInit);
      React.useEffect(() => {
        onInitRef.current?.({
          screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x: x - 50, y: y - 40 }),
        });
      }, []);

      return (
        <div data-testid="react-flow">
          <button data-testid="flow-pane" onClick={(event) => onPaneClick?.(event)} />
          {nodes.map((node: any) => {
            const NodeComponent = nodeTypes[node.type];
            return (
              <div
                key={node.id}
                data-testid={`flow-node-${node.id}`}
                onClick={(event) => onNodeClick?.(event, node)}
                role="button"
                tabIndex={0}
              >
                <NodeComponent id={node.id} data={node.data} />
                <span
                  data-testid={`drag-node-${node.id}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onNodeDragStop?.(event, {
                      ...node,
                      position: { x: node.position.x + 25, y: node.position.y + 15 },
                    });
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
                      pointer: { x: 580, y: 500 },
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
                      pointer: { x: 320, y: 260 },
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
  };
});

const baseStory: Story = {
  id: 'story-1',
  title: 'Test story',
  createdAt: '2026-07-14T08:00:00.000Z',
  updatedAt: '2026-07-14T08:00:00.000Z',
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

describe('StoryEditor', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.resetAllMocks();
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

  it('creates root and child interactions', async () => {
    const user = userEvent.setup();
    const withRoot = cloneStory();
    withRoot.interactions.push({
      id: 'interaction-root',
      title: 'Created root',
      body: 'Root body',
      position: { x: 80, y: 252 },
      triggers: [{ id: 'trigger-root', inputInteractionIds: [], conditions: [] }],
    });
    const withChild = storyWithTwoInteractions();
    withChild.interactions[1].position = { x: 80, y: 384 };
    vi.mocked(api.createInteraction)
      .mockResolvedValueOnce(withRoot)
      .mockResolvedValueOnce(withChild);

    await renderEditor();

    await user.click(screen.getByRole('button', { name: 'Add root' }));
    expect(api.createInteraction).toHaveBeenCalledWith('story-1', { position: { x: 80, y: 252 } });
    expect(await screen.findByText('Created root')).toBeInTheDocument();

    await user.click(screen.getByTestId('flow-node-interaction-1'));
    await user.click(screen.getByRole('button', { name: 'Add child' }));
    expect(api.createInteraction).toHaveBeenLastCalledWith('story-1', {
      parentId: 'interaction-1',
      position: { x: 80, y: 384 },
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
    await userEvent.click(screen.getByTestId('drop-source-interaction-1'));

    await waitFor(() => {
      expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
        parentId: 'interaction-1',
        position: { x: 425, y: 412 },
      });
    });
  });

  it('creates a child interaction from the hovered node action', async () => {
    const withNewChild = storyWithTwoInteractions();
    vi.mocked(api.createInteraction).mockResolvedValue(withNewChild);

    await renderEditor();
    const node = screen.getByTestId('flow-node-interaction-1');
    await userEvent.click(within(node).getByRole('button', { name: 'Create child interaction' }));

    await waitFor(() => {
      expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
        parentId: 'interaction-1',
        position: { x: 80, y: 252 },
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
    vi.mocked(api.addTrigger).mockResolvedValue(withTrigger);
    vi.mocked(api.updateTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    await userEvent.click(screen.getByTestId('drop-target-interaction-2'));

    await waitFor(() => {
      expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
        position: { x: 165, y: 172 },
      });
      expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-2');
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-new', {
        inputInteractionIds: ['interaction-parent'],
        conditions: [],
      });
    });
  });

  it('creates a parent interaction from the hovered node action', async () => {
    const story = storyWithTwoInteractions();
    const withParent = structuredClone(story);
    withParent.interactions.push({
      id: 'interaction-parent',
      title: 'Created source',
      body: 'Source body',
      position: { x: 80, y: 6 },
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
    vi.mocked(api.addTrigger).mockResolvedValue(withTrigger);
    vi.mocked(api.updateTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    const node = screen.getByTestId('flow-node-interaction-2');
    await userEvent.click(within(node).getByRole('button', { name: 'Create source interaction' }));

    await waitFor(() => {
      expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
        position: { x: 80, y: 6 },
      });
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-new', {
        inputInteractionIds: ['interaction-parent'],
        conditions: [],
      });
    });
  });

  it('places a new child interaction below occupied vertical outputs instead of overlapping them', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    story.interactions[1].position = { x: 80, y: 270 };
    const withNewChild = structuredClone(story);
    withNewChild.interactions.push({
      id: 'interaction-3',
      title: 'New output',
      body: 'Additional output',
      position: { x: 80, y: 384 },
      triggers: [{ id: 'trigger-3', inputInteractionIds: ['interaction-1'], conditions: [] }],
    });
    vi.mocked(api.createInteraction).mockResolvedValue(withNewChild);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-node-interaction-1'));
    await user.click(screen.getByRole('button', { name: 'Add child' }));

    expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
      parentId: 'interaction-1',
      position: { x: 80, y: 384 },
    });
  });

  it('keeps the editor visible when an interaction title is edited', async () => {
    const user = userEvent.setup();
    const updatedStory = cloneStory();
    updatedStory.interactions[0].title = 'New title';
    vi.mocked(api.updateInteraction).mockResolvedValue(updatedStory);

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
    expect(await screen.findByDisplayValue('Long new content')).toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText('Content'), { target: { value: 'Saved content' } });
    fireEvent.blur(screen.getByLabelText('Content'));

    await waitFor(() => expect(api.updateInteraction).toHaveBeenCalledTimes(1));
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
    expect(screen.getByDisplayValue('Saved content')).toBeInTheDocument();
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
    vi.mocked(api.addTrigger).mockResolvedValue(withTrigger);
    vi.mocked(api.updateTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('connect-interaction-1-interaction-3'));

    await waitFor(() => {
      expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-3');
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-3', 'trigger-new', {
        inputInteractionIds: ['interaction-1'],
        conditions: [],
      });
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
    vi.mocked(api.addTrigger).mockResolvedValue(withTrigger);
    vi.mocked(api.updateTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('connect-interaction-1-interaction-2'));

    await waitFor(() => {
      expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-2');
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-new', {
        inputInteractionIds: ['interaction-1'],
        conditions: [],
      });
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
    vi.mocked(api.addTrigger).mockResolvedValue(withNewTrigger);
    vi.mocked(api.updateTrigger).mockResolvedValue(connectedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('connect-interaction-2-interaction-3'));

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-3', 'trigger-new', {
        inputInteractionIds: ['interaction-2'],
        conditions: [],
      });
    });
    expect(await screen.findByTestId('flow-edge-interaction-1-interaction-3')).toBeInTheDocument();
    expect(await screen.findByTestId('flow-edge-interaction-2-interaction-3')).toBeInTheDocument();
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
    vi.mocked(api.addTrigger).mockResolvedValue(staleWithNewTrigger);
    vi.mocked(api.updateTrigger)
      .mockResolvedValueOnce(withoutRootLink)
      .mockResolvedValueOnce(staleConnectedStory);

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
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-3', 'trigger-new', {
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
    expect(screen.getByText('OR')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Delete this OR group' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Delete all OR groups' })).toBeInTheDocument();
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
    expect(screen.queryByRole('complementary', { name: 'Inspector' })).not.toBeInTheDocument();
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
    const withNewTrigger = structuredClone(story);
    withNewTrigger.interactions[1].triggers.push({
      id: 'trigger-or',
      inputInteractionIds: [],
      conditions: [],
    });
    const withOrGroup = structuredClone(withNewTrigger);
    withOrGroup.interactions[1].triggers[1].inputInteractionIds = ['interaction-1'];
    withOrGroup.interactions[1].triggers[1].conditions = [
      { interactionId: 'interaction-1', hasBeenVisited: true },
    ];
    vi.mocked(api.addTrigger).mockResolvedValue(withNewTrigger);
    vi.mocked(api.updateTrigger).mockResolvedValue(withOrGroup);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-trigger-interaction-2-trigger-2'));
    await user.click(screen.getByRole('button', { name: 'Add OR condition group' }));

    await waitFor(() => {
      expect(api.addTrigger).toHaveBeenCalledWith('story-1', 'interaction-2');
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-or', {
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
      });
    });
    expect(await screen.findByText('OR')).toBeInTheDocument();
    expect(screen.getByText('Condition group 2')).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Delete trigger' })).toBeEnabled();
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
