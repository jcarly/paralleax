import React from 'react';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
    updateTrigger: vi.fn(),
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
    ReactFlow: ({ nodes, nodeTypes, onNodeClick, onNodeDragStop, children }: any) => (
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
  title: 'Histoire test',
  createdAt: '2026-07-14T08:00:00.000Z',
  updatedAt: '2026-07-14T08:00:00.000Z',
  interactions: [
    {
      id: 'interaction-1',
      title: 'Titre original',
      body: 'Contenu original',
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
        title: 'Deuxieme interaction',
        body: 'Suite du contenu',
        position: { x: 420, y: 180 },
        triggers: [{ id: 'trigger-2', inputInteractionIds: ['interaction-1'], conditions: [] }],
      },
    ],
  };
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

  await screen.findByText('Titre original');
}

describe('StoryEditor', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('shows a loading error when the story cannot be loaded', async () => {
    vi.mocked(api.getStory).mockRejectedValue(new Error('Story introuvable'));

    render(
      <MemoryRouter initialEntries={['/stories/story-1/edit']}>
        <Routes>
          <Route path="/stories/:storyId/edit" element={<StoryEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Story introuvable')).toBeInTheDocument();
  });

  it('renames the story title', async () => {
    const user = userEvent.setup();
    const renamedStory = cloneStory();
    renamedStory.title = 'Story renommee';
    vi.mocked(api.renameStory).mockResolvedValue(renamedStory);

    await renderEditor();

    const storyTitleInput = screen.getByDisplayValue('Histoire test');
    await user.clear(storyTitleInput);
    await user.type(storyTitleInput, 'Story renommee');
    await user.tab();

    expect(api.renameStory).toHaveBeenCalledWith('story-1', 'Story renommee');
    expect(await screen.findByDisplayValue('Story renommee')).toBeInTheDocument();
  });

  it('creates root and child interactions', async () => {
    const user = userEvent.setup();
    const withRoot = cloneStory();
    withRoot.interactions.push({
      id: 'interaction-root',
      title: 'Racine creee',
      body: 'Corps racine',
      position: { x: 100, y: 120 },
      triggers: [{ id: 'trigger-root', inputInteractionIds: [], conditions: [] }],
    });
    const withChild = storyWithTwoInteractions();
    vi.mocked(api.createInteraction)
      .mockResolvedValueOnce(withRoot)
      .mockResolvedValueOnce(withChild);

    await renderEditor();

    await user.click(screen.getByRole('button', { name: 'Ajouter une racine' }));
    expect(api.createInteraction).toHaveBeenCalledWith('story-1', { position: { x: 100, y: 120 } });
    expect(await screen.findByText('Racine creee')).toBeInTheDocument();

    await user.click(screen.getByTestId('flow-node-interaction-1'));
    await user.click(screen.getByRole('button', { name: 'Ajouter une suite' }));
    expect(api.createInteraction).toHaveBeenLastCalledWith('story-1', {
      parentId: 'interaction-1',
      position: { x: 420, y: 260 },
    });
  });

  it('keeps the editor visible when an interaction title is edited', async () => {
    const user = userEvent.setup();
    const updatedStory = cloneStory();
    updatedStory.interactions[0].title = 'Nouveau titre';
    vi.mocked(api.updateInteraction).mockResolvedValue(updatedStory);

    await renderEditor();
    await user.click(screen.getByTestId('flow-node-interaction-1'));

    const titleInput = screen.getByLabelText('Titre');
    await user.clear(titleInput);
    await user.type(titleInput, 'Nouveau titre');
    await user.tab();

    expect(await screen.findByDisplayValue('Nouveau titre')).toBeInTheDocument();
    expect(screen.getByText('Nouveau titre')).toBeInTheDocument();
    expect(screen.queryByText('Chargement...')).not.toBeInTheDocument();
    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', { title: 'Nouveau titre' });
  });

  it('updates interaction body from the inspector', async () => {
    const user = userEvent.setup();
    const updatedStory = cloneStory();
    updatedStory.interactions[0].body = 'Nouveau contenu long';
    vi.mocked(api.updateInteraction).mockResolvedValue(updatedStory);

    await renderEditor();
    await user.click(screen.getByTestId('flow-node-interaction-1'));

    const bodyInput = screen.getByLabelText('Contenu');
    await user.clear(bodyInput);
    await user.type(bodyInput, 'Nouveau contenu long');
    await user.tab();

    expect(api.updateInteraction).toHaveBeenCalledWith('story-1', 'interaction-1', { body: 'Nouveau contenu long' });
    expect(await screen.findByDisplayValue('Nouveau contenu long')).toBeInTheDocument();
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
    expect(within(interactionNode).getByText('Titre original')).toBeInTheDocument();
    expect(within(interactionNode).getByText('Contenu original')).toBeInTheDocument();
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
    expect(within(otherInteractionNode).getByText('Deuxieme interaction')).toBeInTheDocument();
    expect(within(otherInteractionNode).getByText('Suite du contenu')).toBeInTheDocument();
  });

  it('deletes the selected interaction', async () => {
    const user = userEvent.setup();
    const afterDelete = cloneStory();
    afterDelete.interactions = [];
    vi.mocked(api.deleteInteraction).mockResolvedValue(afterDelete);

    await renderEditor();
    await user.click(screen.getByTestId('flow-node-interaction-1'));
    await user.click(screen.getByRole('button', { name: "Supprimer l'interaction" }));

    expect(api.deleteInteraction).toHaveBeenCalledWith('story-1', 'interaction-1');
    expect(await screen.findByText('Selectionnez un bloc pour modifier son contenu et ses triggers.')).toBeInTheDocument();
  });

  it('updates trigger inputs from checkboxes', async () => {
    const user = userEvent.setup();
    const story = storyWithTwoInteractions();
    const updatedStory = structuredClone(story);
    updatedStory.interactions[0].triggers[0].inputInteractionIds = ['interaction-2'];
    vi.mocked(api.updateTrigger).mockResolvedValue(updatedStory);

    await renderEditor(story);
    await user.click(screen.getByTestId('flow-node-interaction-1'));
    await user.click(screen.getByRole('checkbox', { name: 'Deuxieme interaction' }));

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenCalledWith('story-1', 'interaction-1', 'trigger-1', {
        inputInteractionIds: ['interaction-2'],
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
    await user.click(screen.getByRole('button', { name: 'Ajouter une condition' }));

    await waitFor(() => {
      expect(api.updateTrigger).toHaveBeenLastCalledWith('story-1', 'interaction-1', 'trigger-1', {
        inputInteractionIds: [],
        conditions: [{ interactionId: 'interaction-2', hasBeenVisited: true }],
      });
    });

    await screen.findByDisplayValue('a ete visitee');
    await user.selectOptions(screen.getByDisplayValue('a ete visitee'), 'not-visited');
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

  it('does not render a blank page when the selected interaction has no trigger', async () => {
    const storyWithoutTrigger = cloneStory();
    storyWithoutTrigger.interactions[0].triggers = [];

    await renderEditor(storyWithoutTrigger);
    await userEvent.click(screen.getByTestId('flow-node-interaction-1'));

    expect(screen.getByText("Cette interaction n'a pas encore de trigger.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: "Supprimer l'interaction" })).toBeInTheDocument();
  });
});
