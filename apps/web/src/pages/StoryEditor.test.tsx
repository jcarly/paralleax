import React from 'react';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
    Handle: () => null,
    MarkerType: { ArrowClosed: 'arrowclosed' },
    MiniMap: () => <div data-testid="flow-minimap" />,
    Position: { Left: 'left', Right: 'right' },
    ReactFlow: ({ nodes, edges, nodeTypes, onConnect, onEdgeClick, onNodeClick, onNodeDragStop, children }: any) => (
      <div data-testid="react-flow">
        {nodes.map((node: any) => {
          const NodeComponent = nodeTypes[node.type];
          return (
            <button
              key={node.id}
              data-testid={`flow-node-${node.id}`}
              onClick={(event) => onNodeClick?.(event, node)}
            >
              <NodeComponent data={node.data} />
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
            </button>
          );
        })}
        {nodes.flatMap((source: any) =>
          nodes.filter((target: any) => target.id !== source.id).map((target: any) => (
            <button
              key={`${source.id}-${target.id}`}
              data-testid={`connect-${source.id}-${target.id}`}
              onClick={() => onConnect?.({ source: source.id, target: target.id })}
            />
          )),
        )}
        {edges.map((edge: any) => (
          <button
            key={edge.id}
            data-testid={`flow-edge-${edge.source}-${edge.target}`}
            onClick={(event) => onEdgeClick?.(event, edge)}
          />
        ))}
        {children}
      </div>
    ),
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
        position: { x: 420, y: 180 },
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
    position: { x: 760, y: 300 },
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
      position: { x: 100, y: 120 },
      triggers: [{ id: 'trigger-root', inputInteractionIds: [], conditions: [] }],
    });
    const withChild = storyWithTwoInteractions();
    vi.mocked(api.createInteraction)
      .mockResolvedValueOnce(withRoot)
      .mockResolvedValueOnce(withChild);

    await renderEditor();

    await user.click(screen.getByRole('button', { name: 'Add root' }));
    expect(api.createInteraction).toHaveBeenCalledWith('story-1', { position: { x: 100, y: 120 } });
    expect(await screen.findByText('Created root')).toBeInTheDocument();

    await user.click(screen.getByTestId('flow-node-interaction-1'));
    await user.click(screen.getByRole('button', { name: 'Add child' }));
    expect(api.createInteraction).toHaveBeenLastCalledWith('story-1', {
      parentId: 'interaction-1',
      position: { x: 420, y: 260 },
    });
  });

  it('places a new child interaction below existing outputs instead of overlapping them', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    story.interactions[1].position = { x: 420, y: 260 };
    const withNewChild = structuredClone(story);
    withNewChild.interactions.push({
      id: 'interaction-3',
      title: 'New output',
      body: 'Additional output',
      position: { x: 420, y: 410 },
      triggers: [{ id: 'trigger-3', inputInteractionIds: ['interaction-1'], conditions: [] }],
    });
    vi.mocked(api.createInteraction).mockResolvedValue(withNewChild);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-node-interaction-1'));
    await user.click(screen.getByRole('button', { name: 'Add child' }));

    expect(api.createInteraction).toHaveBeenCalledWith('story-1', {
      parentId: 'interaction-1',
      position: { x: 420, y: 410 },
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
    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', { title: 'New title' });
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

    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', { body: 'Long new content' });
    expect(await screen.findByDisplayValue('Long new content')).toBeInTheDocument();
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
    expect(await screen.findByText('Select a block to edit its content, or select an edge to edit its trigger.')).toBeInTheDocument();
  });

  it('updates linked trigger inputs from the edge editor', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    const updatedStory = structuredClone(story);
    updatedStory.interactions[1].triggers[0].inputInteractionIds = ['interaction-1', 'interaction-3'];
    vi.mocked(api.updateTrigger).mockResolvedValue(updatedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-edge-interaction-1-interaction-2'));
    await user.click(screen.getByRole('checkbox', { name: 'Third interaction' }));

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        inputInteractionIds: ['interaction-1', 'interaction-3'],
        conditions: [],
      });
    });
  });

  it('persists a canvas connection as a trigger input', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    const withTrigger = structuredClone(story);
    withTrigger.interactions[2].triggers.push({ id: 'trigger-new', inputInteractionIds: [], conditions: [] });
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
    withTrigger.interactions[1].triggers = [{ id: 'trigger-new', inputInteractionIds: [], conditions: [] }];
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
    withNewTrigger.interactions[2].triggers.push({ id: 'trigger-new', inputInteractionIds: [], conditions: [] });
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

  it('does not restore a deleted link when another canvas connection is created from that interaction', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[2].triggers = [];
    const withoutRootLink = structuredClone(story);
    withoutRootLink.interactions[1].triggers = [];
    const staleWithNewTrigger = structuredClone(story);
    staleWithNewTrigger.interactions[2].triggers = [{ id: 'trigger-new', inputInteractionIds: [], conditions: [] }];
    const staleConnectedStory = structuredClone(staleWithNewTrigger);
    staleConnectedStory.interactions[2].triggers[0].inputInteractionIds = ['interaction-2'];
    vi.mocked(api.deleteTrigger).mockResolvedValue(withoutRootLink);
    vi.mocked(api.addTrigger).mockResolvedValue(staleWithNewTrigger);
    vi.mocked(api.updateTrigger).mockResolvedValue(staleConnectedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-edge-interaction-1-interaction-2'));
    await user.click(screen.getByRole('button', { name: 'Delete link' }));

    await waitFor(() => {
      expect(api.deleteTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2');
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

  it('opens the trigger editor from an edge and updates that trigger conditions', async () => {
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
    await user.click(screen.getByTestId('flow-edge-interaction-1-interaction-3'));

    expect(screen.getByRole('heading', { name: 'Trigger' })).toBeInTheDocument();
    expect(screen.getByText('Output interaction: Third interaction')).toBeInTheDocument();

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
    staleUpdatedStory.interactions[1].triggers[0].conditions = [{ interactionId: 'interaction-1', hasBeenVisited: true }];
    staleUpdatedStory.interactions[1].title = '';
    staleUpdatedStory.interactions[1].body = '';
    staleUpdatedStory.interactions[1].position = { x: 0, y: 0 };
    vi.mocked(api.updateTrigger).mockResolvedValue(staleUpdatedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-edge-interaction-1-interaction-2'));
    await user.click(screen.getByRole('button', { name: 'Add condition' }));

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2', {
        inputInteractionIds: ['interaction-1'],
        conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
      });
    });

    const firstNode = within(screen.getByTestId('flow-node-interaction-1')).getByTestId('interaction-node');
    const secondNode = within(screen.getByTestId('flow-node-interaction-2')).getByTestId('interaction-node');
    expect(within(firstNode).getByText('Original title')).toBeInTheDocument();
    expect(within(firstNode).getByText('Original content')).toBeInTheDocument();
    expect(within(secondNode).getByText('Second interaction')).toBeInTheDocument();
    expect(within(secondNode).getByText('Next content')).toBeInTheDocument();
  });

  it('merges a delayed trigger save into the latest local editor state', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    let resolveTriggerSave: (story: Story) => void = () => {};
    vi.mocked(api.updateTrigger).mockReturnValue(new Promise((resolve) => {
      resolveTriggerSave = resolve;
    }));

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-edge-interaction-1-interaction-2'));
    await user.click(screen.getByRole('button', { name: 'Add condition' }));

    await user.click(screen.getByTestId('flow-node-interaction-2'));
    const titleInput = screen.getByLabelText('Title');
    await user.clear(titleInput);
    await user.type(titleInput, 'Fresh second title');

    const staleUpdatedStory = structuredClone(story);
    staleUpdatedStory.interactions[1].triggers[0].conditions = [{ interactionId: 'interaction-1', hasBeenVisited: true }];
    staleUpdatedStory.interactions[1].title = '';
    staleUpdatedStory.interactions[1].body = '';

    await act(async () => {
      resolveTriggerSave(staleUpdatedStory);
    });

    const secondNode = within(screen.getByTestId('flow-node-interaction-2')).getByTestId('interaction-node');
    expect(within(secondNode).getByText('Fresh second title')).toBeInTheDocument();
    expect(within(secondNode).getByText('Next content')).toBeInTheDocument();
  });

  it('allows several input interactions for the same trigger', async () => {
    const user = userEvent.setup();
    const story = storyWithThreeInteractions();
    story.interactions[2].triggers[0].inputInteractionIds = ['interaction-1'];
    const withTwoInputs = structuredClone(story);
    withTwoInputs.interactions[2].triggers[0].inputInteractionIds = ['interaction-1', 'interaction-2'];
    vi.mocked(api.updateTrigger).mockResolvedValue(withTwoInputs);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-edge-interaction-1-interaction-3'));
    await user.click(screen.getByRole('checkbox', { name: 'Second interaction' }));

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenLastCalledWith('story-1', 'interaction-3', 'trigger-3', {
        inputInteractionIds: ['interaction-1', 'interaction-2'],
        conditions: [],
      });
    });
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
    await user.click(screen.getByTestId('flow-node-interaction-1'));
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

  it('shows linked trigger conditions only from the edge editor', async () => {
    const story = storyWithTwoInteractions();

    await renderEditor(story);
    await userEvent.click(screen.getByTestId('flow-node-interaction-2'));

    expect(screen.getByRole('heading', { name: 'Interaction' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Path conditions' })).not.toBeInTheDocument();
    expect(screen.getByText('Select an edge to edit path conditions for linked triggers.')).toBeInTheDocument();
  });

  it('keeps root trigger editing in the interaction inspector', async () => {
    await renderEditor();
    await userEvent.click(screen.getByTestId('flow-node-interaction-1'));

    expect(screen.getByRole('heading', { name: 'Trigger' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Path conditions' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Trigger inputs' })).not.toBeInTheDocument();
    expect(screen.getByText('This root trigger has no input; select an edge to edit linked trigger inputs.')).toBeInTheDocument();
  });

  it('deletes the selected edge link from the edge editor', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const withoutTrigger = structuredClone(story);
    withoutTrigger.interactions[1].triggers = [];
    vi.mocked(api.deleteTrigger).mockResolvedValue(withoutTrigger);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-edge-interaction-1-interaction-2'));
    await user.click(screen.getByRole('button', { name: 'Delete link' }));

    await waitFor(() => {
      expect(api.deleteTrigger).toHaveBeenCalledWith('story-1', 'interaction-2', 'trigger-2');
    });
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
    await user.click(screen.getByTestId('flow-edge-interaction-1-interaction-2'));
    await user.click(screen.getByRole('button', { name: 'Delete link' }));

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

  it('does not restore a deleted trigger when a later interaction move returns stale trigger data', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const withoutTrigger = structuredClone(story);
    withoutTrigger.interactions[1].triggers = [];
    const staleMovedStory = structuredClone(story);
    staleMovedStory.interactions[1].position = { x: 445, y: 195 };
    let resolveDelete: (story: Story) => void = () => {};
    vi.mocked(api.deleteTrigger).mockReturnValue(new Promise((resolve) => {
      resolveDelete = resolve;
    }));
    vi.mocked(api.updateInteraction).mockResolvedValue(staleMovedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-edge-interaction-1-interaction-2'));
    await user.click(screen.getByRole('button', { name: 'Delete link' }));

    expect(screen.queryByTestId('flow-edge-interaction-1-interaction-2')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('drag-node-interaction-2'));

    await waitFor(() => {
      expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-2', {
        position: { x: 445, y: 195 },
      });
    });
    expect(screen.queryByTestId('flow-edge-interaction-1-interaction-2')).not.toBeInTheDocument();

    await act(async () => {
      resolveDelete(withoutTrigger);
    });
  });

  it('does not render a blank page when the selected interaction has no trigger', async () => {
    const storyWithoutTrigger = cloneStory();
    storyWithoutTrigger.interactions[0].triggers = [];

    await renderEditor(storyWithoutTrigger);
    await userEvent.click(screen.getByTestId('flow-node-interaction-1'));

    expect(screen.getByText('Select an edge to edit path conditions for linked triggers.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete interaction' })).toBeInTheDocument();
  });
});
