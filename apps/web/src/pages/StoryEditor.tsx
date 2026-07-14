import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react';
import { Link, useParams } from 'react-router-dom';
import type { Interaction, Story, TriggerCondition } from '@paralleax/shared';
import { api } from '../api';
import { InteractionNode, type InteractionNodeData } from '../components/InteractionNode';

const nodeTypes = { interaction: InteractionNode };
type InteractionFlowNode = Node<InteractionNodeData>;

function updateInteractionInStory(story: Story, interactionId: string, patch: Partial<Interaction>): Story {
  return {
    ...story,
    interactions: story.interactions.map((item) =>
      item.id === interactionId ? { ...item, ...patch } : item,
    ),
  };
}

function mergePatchedStory(
  current: Story,
  updated: Story,
  interactionId: string,
  patch: Partial<Pick<Interaction, 'title' | 'body' | 'position'>>,
): Story {
  return {
    ...updated,
    interactions: updated.interactions.map((item) => {
      const currentItem = current.interactions.find((candidate) => candidate.id === item.id);
      if (!currentItem) return item;
      if (item.id !== interactionId) return currentItem;
      return {
        ...item,
        title: patch.title ?? currentItem.title,
        body: patch.body ?? currentItem.body,
        position: patch.position ?? currentItem.position,
      };
    }),
  };
}

export function StoryEditor() {
  const { storyId = '' } = useParams();
  const [story, setStory] = useState<Story>();
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<InteractionFlowNode>([]);

  const load = useCallback(
    () => api.getStory(storyId).then(setStory).catch((e: Error) => setError(e.message)),
    [storyId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const selected = story?.interactions.find((item) => item.id === selectedId);
  const storyNodes = useMemo<InteractionFlowNode[]>(
    () =>
      story?.interactions.map((item) => ({
        id: item.id,
        type: 'interaction',
        position: item.position,
        data: {
          title: item.title,
          body: item.body,
          selected: item.id === selectedId,
        },
      })) ?? [],
    [story, selectedId],
  );

  useEffect(() => {
    setNodes(storyNodes);
  }, [setNodes, storyNodes]);

  const edges = useMemo<Edge[]>(
    () =>
      story?.interactions.flatMap((target) =>
        target.triggers.flatMap((trigger) =>
          trigger.inputInteractionIds.map((source) => ({
            id: `${trigger.id}-${source}`,
            source,
            target: target.id,
            markerEnd: { type: MarkerType.ArrowClosed },
            label: trigger.conditions.length ? `${trigger.conditions.length} condition(s)` : undefined,
          })),
        ),
      ) ?? [],
    [story],
  );

  const select: NodeMouseHandler = (_, node) => setSelectedId(node.id);

  async function createRoot() {
    setStory(await api.createInteraction(storyId, { position: { x: 100, y: 120 } }));
  }

  async function createChild() {
    if (!selected) return;
    setStory(await api.createInteraction(storyId, {
      parentId: selected.id,
      position: { x: selected.position.x + 340, y: selected.position.y + 140 },
    }));
  }

  async function patchInteraction(id: string, patch: Partial<Pick<Interaction, 'title' | 'body' | 'position'>>) {
    setStory((current) => (current ? updateInteractionInStory(current, id, patch) : current));
    const updated = await api.updateInteraction(storyId, id, patch);
    setStory((current) => {
      if (!current) return updated;
      return mergePatchedStory(current, updated, id, patch);
    });
  }

  async function remove() {
    if (!selected) return;
    setStory(await api.deleteInteraction(storyId, selected.id));
    setSelectedId(undefined);
  }

  if (!story) return <main className="page">{error || 'Chargement...'}</main>;

  return (
    <main className="editor-page">
      <div className="editor-toolbar">
        <input
          className="story-title-input"
          value={story.title}
          onChange={(e) => setStory({ ...story, title: e.target.value })}
          onBlur={(e) => void api.renameStory(storyId, e.target.value).then(setStory)}
        />
        <div className="actions">
          <button onClick={() => void createRoot()}>Ajouter une racine</button>
          <button disabled={!selected} onClick={() => void createChild()}>Ajouter une suite</button>
          <Link className="button secondary" to={`/stories/${storyId}/play`}>Tester</Link>
        </div>
      </div>
      <div className="editor-layout">
        <section className="canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={select}
            onNodeDragStop={(_, node) => void patchInteraction(node.id, { position: node.position })}
            fitView
          >
            <Background />
            <MiniMap />
            <Controls />
          </ReactFlow>
        </section>
        <aside className="inspector">
          {selected ? (
            <InteractionInspector
              story={story}
              interaction={selected}
              onChange={(next) => setStory(next)}
              onPatch={patchInteraction}
              onDelete={remove}
            />
          ) : (
            <div className="empty-state">
              <h2>Interaction</h2>
              <p>Selectionnez un bloc pour modifier son contenu et ses triggers.</p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function InteractionInspector({
  story,
  interaction,
  onChange,
  onPatch,
  onDelete,
}: {
  story: Story;
  interaction: Interaction;
  onChange: (story: Story) => void;
  onPatch: (id: string, patch: Partial<Interaction>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const trigger = interaction.triggers[0];

  async function updateTrigger(inputIds: string[], conditions: TriggerCondition[]) {
    if (!trigger) return;
    onChange(await api.updateTrigger(story.id, interaction.id, trigger.id, {
      inputInteractionIds: inputIds,
      conditions,
    }));
  }

  function updateLocalInteraction(patch: Partial<Interaction>) {
    onChange(updateInteractionInStory(story, interaction.id, patch));
  }

  if (!trigger) {
    return (
      <div>
        <h2>Interaction</h2>
        <p className="error">Cette interaction n'a pas encore de trigger.</p>
        <button className="danger" onClick={() => void onDelete()}>Supprimer l'interaction</button>
      </div>
    );
  }

  return (
    <div>
      <h2>Interaction</h2>
      <label>
        Titre
        <input
          value={interaction.title}
          onChange={(e) => updateLocalInteraction({ title: e.target.value })}
          onBlur={(e) => void onPatch(interaction.id, { title: e.target.value })}
        />
      </label>
      <label>
        Contenu
        <textarea
          rows={7}
          value={interaction.body}
          onChange={(e) => updateLocalInteraction({ body: e.target.value })}
          onBlur={(e) => void onPatch(interaction.id, { body: e.target.value })}
        />
      </label>
      <h3>Entrees du trigger</h3>
      <p className="hint">Aucune entree signifie que l'interaction peut demarrer l'histoire.</p>
      <div className="check-list">
        {story.interactions.filter((item) => item.id !== interaction.id).map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={trigger.inputInteractionIds.includes(item.id)}
              onChange={(e) => void updateTrigger(
                e.target.checked
                  ? [...trigger.inputInteractionIds, item.id]
                  : trigger.inputInteractionIds.filter((id) => id !== item.id),
                trigger.conditions,
              )}
            />
            {item.title}
          </label>
        ))}
      </div>
      <h3>Conditions de parcours</h3>
      <div className="conditions">
        {trigger.conditions.map((condition, index) => (
          <div className="condition" key={`${condition.interactionId}-${index}`}>
            <select
              value={condition.interactionId}
              onChange={(e) => {
                const next = [...trigger.conditions];
                next[index] = { ...condition, interactionId: e.target.value };
                void updateTrigger(trigger.inputInteractionIds, next);
              }}
            >
              {story.interactions.filter((item) => item.id !== interaction.id).map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
            <select
              value={condition.hasBeenVisited ? 'visited' : 'not-visited'}
              onChange={(e) => {
                const next = [...trigger.conditions];
                next[index] = { ...condition, hasBeenVisited: e.target.value === 'visited' };
                void updateTrigger(trigger.inputInteractionIds, next);
              }}
            >
              <option value="visited">a ete visitee</option>
              <option value="not-visited">n'a pas ete visitee</option>
            </select>
            <button
              className="ghost danger"
              onClick={() => void updateTrigger(
                trigger.inputInteractionIds,
                trigger.conditions.filter((_, i) => i !== index),
              )}
            >
              x
            </button>
          </div>
        ))}
      </div>
      <button
        className="secondary"
        disabled={story.interactions.length < 2}
        onClick={() => {
          const candidate = story.interactions.find((item) => item.id !== interaction.id);
          if (candidate) {
            void updateTrigger(trigger.inputInteractionIds, [
              ...trigger.conditions,
              { interactionId: candidate.id, hasBeenVisited: true },
            ]);
          }
        }}
      >
        Ajouter une condition
      </button>
      <hr />
      <button className="danger" onClick={() => void onDelete()}>Supprimer l'interaction</button>
    </div>
  );
}
