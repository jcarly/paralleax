import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  useNodesState,
  type Connection,
  type Edge,
  type EdgeMouseHandler,
  type Node,
  type NodeMouseHandler,
} from '@xyflow/react';
import { Link, useParams } from 'react-router-dom';
import type { Interaction, Story, TriggerCondition } from '@paralleax/shared';
import { api } from '../api';
import { InteractionNode, type InteractionNodeData } from '../components/InteractionNode';

const nodeTypes = { interaction: InteractionNode };
type InteractionFlowNode = Node<InteractionNodeData>;
type InteractionContentPatch = Partial<Pick<Interaction, 'title' | 'body' | 'position'>>;
interface SelectedTrigger {
  interactionId: string;
  triggerId: string;
  inputInteractionId?: string;
}
const childOffsetX = 340;
const childOffsetY = 140;
const childVerticalGap = 150;
const minNodeVerticalDistance = 120;
const sameColumnTolerance = 260;

function updateInteractionInStory(story: Story, interactionId: string, patch: Partial<Interaction>): Story {
  return {
    ...story,
    interactions: story.interactions.map((item) =>
      item.id === interactionId ? { ...item, ...patch } : item,
    ),
  };
}

function updateTriggerInStory(
  story: Story,
  interactionId: string,
  triggerId: string,
  patch: { inputInteractionIds: string[]; conditions: TriggerCondition[] },
): Story {
  return {
    ...story,
    interactions: story.interactions.map((item) =>
      item.id === interactionId
        ? {
          ...item,
          triggers: item.triggers.map((trigger) =>
            trigger.id === triggerId ? { ...trigger, ...patch } : trigger,
          ),
        }
        : item,
    ),
  };
}

function deleteTriggerInStory(story: Story, interactionId: string, triggerId: string): Story {
  return {
    ...story,
    interactions: story.interactions.map((item) =>
      item.id === interactionId
        ? { ...item, triggers: item.triggers.filter((trigger) => trigger.id !== triggerId) }
        : item,
    ),
  };
}

function hasOwn<T extends object, K extends PropertyKey>(item: T, key: K): item is T & Record<K, unknown> {
  return Object.prototype.hasOwnProperty.call(item, key);
}

function mergeServerStory(
  current: Story,
  incoming: Story,
  edited?: { interactionId: string; patch: InteractionContentPatch },
  options: { preserveCurrentTriggers?: boolean; deletedTriggerIds?: ReadonlySet<string> } = {},
): Story {
  return {
    ...incoming,
    interactions: incoming.interactions.map((item) => {
      const currentItem = current.interactions.find((candidate) => candidate.id === item.id);
      const triggers = (options.preserveCurrentTriggers && currentItem ? currentItem.triggers : item.triggers)
        .filter((trigger) => !options.deletedTriggerIds?.has(trigger.id));
      if (!currentItem) return { ...item, triggers };
      const patch = item.id === edited?.interactionId ? edited.patch : undefined;

      return {
        ...item,
        title: hasOwn(patch ?? {}, 'title') ? patch?.title ?? '' : currentItem.title,
        body: hasOwn(patch ?? {}, 'body') ? patch?.body ?? '' : currentItem.body,
        position: hasOwn(patch ?? {}, 'position') ? patch?.position ?? currentItem.position : currentItem.position,
        triggers,
      };
    }),
  };
}

function getNextChildPosition(story: Story, parent: Interaction) {
  const x = parent.position.x + childOffsetX;
  const firstY = parent.position.y + childOffsetY;
  const occupied = story.interactions.filter((item) => item.id !== parent.id);

  for (let index = 0; index <= occupied.length + 1; index += 1) {
    const y = firstY + index * childVerticalGap;
    const isFree = occupied.every((item) =>
      Math.abs(item.position.x - x) > sameColumnTolerance
      || Math.abs(item.position.y - y) >= minNodeVerticalDistance,
    );
    if (isFree) return { x, y };
  }

  return { x, y: firstY + (occupied.length + 2) * childVerticalGap };
}

export function StoryEditor() {
  const { storyId = '' } = useParams();
  const [story, setStory] = useState<Story>();
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedTrigger, setSelectedTrigger] = useState<SelectedTrigger>();
  const [error, setError] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<InteractionFlowNode>([]);
  const deletedTriggerIds = useRef(new Set<string>());

  const load = useCallback(
    () => api.getStory(storyId).then((next) => {
      deletedTriggerIds.current.clear();
      setStory(next);
    }).catch((e: Error) => setError(e.message)),
    [storyId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const selected = story?.interactions.find((item) => item.id === selectedId);
  const selectedTriggerInteraction = story?.interactions.find((item) => item.id === selectedTrigger?.interactionId);
  const selectedTriggerValue = selectedTriggerInteraction?.triggers.find((trigger) => trigger.id === selectedTrigger?.triggerId);
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
            data: { interactionId: target.id, triggerId: trigger.id, inputInteractionId: source },
          })),
        ),
      ) ?? [],
    [story],
  );

  const select: NodeMouseHandler = (_, node) => {
    setSelectedId(node.id);
    setSelectedTrigger(undefined);
  };
  const selectTrigger: EdgeMouseHandler = (_, edge) => {
    const data = edge.data as Partial<SelectedTrigger> | undefined;
    if (!data?.interactionId || !data.triggerId) return;
    setSelectedId(undefined);
    setSelectedTrigger({
      interactionId: data.interactionId,
      triggerId: data.triggerId,
      inputInteractionId: data.inputInteractionId,
    });
  };

  function mergeIncomingStory(
    current: Story,
    incoming: Story,
    edited?: { interactionId: string; patch: InteractionContentPatch },
    options: { preserveCurrentTriggers?: boolean } = {},
  ): Story {
    return mergeServerStory(current, incoming, edited, {
      ...options,
      deletedTriggerIds: deletedTriggerIds.current,
    });
  }

  async function saveTrigger(
    interactionId: string,
    triggerId: string,
    inputInteractionIds: string[],
    conditions: TriggerCondition[],
  ) {
    const nextInputs = [...new Set(inputInteractionIds)];
    const patch = { inputInteractionIds: nextInputs, conditions };
    setStory((current) => (current ? updateTriggerInStory(current, interactionId, triggerId, patch) : current));
    const next = await api.updateTrigger(storyId, interactionId, triggerId, patch);
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
  }

  async function deleteTrigger(interactionId: string, triggerId: string) {
    deletedTriggerIds.current.add(triggerId);
    setStory((current) => (current ? deleteTriggerInStory(current, interactionId, triggerId) : current));
    const next = await api.deleteTrigger(storyId, interactionId, triggerId);
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
    setSelectedTrigger(undefined);
  }

  async function deleteTriggerInput(interactionId: string, triggerId: string, inputInteractionId: string) {
    const interaction = story?.interactions.find((item) => item.id === interactionId);
    const trigger = interaction?.triggers.find((item) => item.id === triggerId);
    if (!trigger) return;

    const nextInputs = trigger.inputInteractionIds.filter((id) => id !== inputInteractionId);
    if (nextInputs.length === 0) {
      await deleteTrigger(interactionId, triggerId);
      return;
    }

    await saveTrigger(interactionId, triggerId, nextInputs, trigger.conditions);
    setSelectedTrigger(undefined);
  }

  const connectInteractions = useCallback(async (connection: Connection) => {
    if (!story || !connection.source || !connection.target || connection.source === connection.target) return;
    const sourceId = connection.source;
    const targetId = connection.target;
    const target = story.interactions.find((item) => item.id === targetId);
    if (!target) return;
    if (target.triggers.some((trigger) => trigger.inputInteractionIds.includes(sourceId))) return;

    const existingTriggerIds = new Set(target.triggers.map((trigger) => trigger.id));
    const withTrigger = await api.addTrigger(storyId, target.id);
    const nextTarget = withTrigger.interactions.find((item) => item.id === target.id);
    const nextTrigger = nextTarget?.triggers.find((trigger) => !existingTriggerIds.has(trigger.id))
      ?? nextTarget?.triggers.at(-1);
    if (!nextTrigger) {
      setStory((current) => (current ? mergeIncomingStory(current, withTrigger) : withTrigger));
      return;
    }

    const updated = await api.updateTrigger(storyId, target.id, nextTrigger.id, {
      inputInteractionIds: [sourceId],
      conditions: nextTrigger.conditions,
    });
    setStory((current) => (current ? mergeIncomingStory(current, updated) : updated));
  }, [story, storyId]);

  async function createRoot() {
    const next = await api.createInteraction(storyId, { position: { x: 100, y: 120 } });
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
  }

  async function createChild() {
    if (!story || !selected) return;
    const next = await api.createInteraction(storyId, {
      parentId: selected.id,
      position: getNextChildPosition(story, selected),
    });
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
  }

  async function patchInteraction(id: string, patch: InteractionContentPatch) {
    setStory((current) => (current ? updateInteractionInStory(current, id, patch) : current));
    const updated = await api.updateInteraction(storyId, id, patch);
    setStory((current) => {
      if (!current) return updated;
      return mergeIncomingStory(current, updated, { interactionId: id, patch }, { preserveCurrentTriggers: true });
    });
  }

  async function remove() {
    if (!selected) return;
    const next = await api.deleteInteraction(storyId, selected.id);
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
    setSelectedId(undefined);
  }

  if (!story) return <main className="page">{error || 'Loading...'}</main>;

  return (
    <main className="editor-page">
      <div className="editor-toolbar">
        <input
          className="story-title-input"
          value={story.title}
          onChange={(e) => setStory({ ...story, title: e.target.value })}
          onBlur={(e) => void api.renameStory(storyId, e.target.value).then((next) => {
            setStory((current) => (current ? mergeIncomingStory(current, next) : next));
          })}
        />
        <div className="actions">
          <button onClick={() => void createRoot()}>Add root</button>
          <button disabled={!selected} onClick={() => void createChild()}>Add child</button>
          <Link className="button secondary" to={`/stories/${storyId}/play`}>Test</Link>
        </div>
      </div>
      <div className="editor-layout">
        <section className="canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onConnect={(connection) => void connectInteractions(connection)}
            onEdgeClick={selectTrigger}
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
              onSaveTrigger={saveTrigger}
              onPatch={patchInteraction}
              onDelete={remove}
              onDeleteTrigger={deleteTrigger}
              onDeleteTriggerInput={deleteTriggerInput}
            />
          ) : selectedTriggerInteraction && selectedTriggerValue ? (
            <TriggerInspector
              story={story}
              interaction={selectedTriggerInteraction}
              trigger={selectedTriggerValue}
              selectedInputInteractionId={selectedTrigger?.inputInteractionId}
              onSaveTrigger={saveTrigger}
              onDeleteTrigger={deleteTrigger}
              onDeleteTriggerInput={deleteTriggerInput}
            />
          ) : (
            <div className="empty-state">
              <h2>Interaction</h2>
              <p>Select a block to edit its content, or select an edge to edit its trigger.</p>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function TriggerInspector({
  story,
  interaction,
  trigger,
  selectedInputInteractionId,
  onSaveTrigger,
  onDeleteTrigger,
  onDeleteTriggerInput,
  showInputs = true,
}: {
  story: Story;
  interaction: Interaction;
  trigger: Interaction['triggers'][number];
  selectedInputInteractionId?: string;
  onSaveTrigger: (
    interactionId: string,
    triggerId: string,
    inputInteractionIds: string[],
    conditions: TriggerCondition[],
  ) => Promise<void>;
  onDeleteTrigger: (interactionId: string, triggerId: string) => Promise<void>;
  onDeleteTriggerInput: (interactionId: string, triggerId: string, inputInteractionId: string) => Promise<void>;
  showInputs?: boolean;
}) {
  async function updateTrigger(inputIds: string[], conditions: TriggerCondition[]) {
    await onSaveTrigger(interaction.id, trigger.id, inputIds, conditions);
  }

  return (
    <div>
      <h2>Trigger</h2>
      <p className="hint">Output interaction: {interaction.title}</p>
      {showInputs ? (
        <>
          <h3>Trigger inputs</h3>
          <p className="hint">No input means the interaction can start the story.</p>
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
        </>
      ) : (
        <p className="hint">This root trigger has no input; select an edge to edit linked trigger inputs.</p>
      )}
      <h3>Path conditions</h3>
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
              <option value="visited">has been visited</option>
              <option value="not-visited">has not been visited</option>
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
        Add condition
      </button>
      <hr />
      {selectedInputInteractionId ? (
        <button
          className="danger"
          onClick={() => void onDeleteTriggerInput(interaction.id, trigger.id, selectedInputInteractionId)}
        >
          Delete link
        </button>
      ) : (
        <button className="danger" onClick={() => void onDeleteTrigger(interaction.id, trigger.id)}>Delete trigger</button>
      )}
    </div>
  );
}

function InteractionInspector({
  story,
  interaction,
  onChange,
  onSaveTrigger,
  onPatch,
  onDelete,
  onDeleteTrigger,
  onDeleteTriggerInput,
}: {
  story: Story;
  interaction: Interaction;
  onChange: (story: Story) => void;
  onSaveTrigger: (
    interactionId: string,
    triggerId: string,
    inputInteractionIds: string[],
    conditions: TriggerCondition[],
  ) => Promise<void>;
  onPatch: (id: string, patch: Partial<Interaction>) => Promise<void>;
  onDelete: () => Promise<void>;
  onDeleteTrigger: (interactionId: string, triggerId: string) => Promise<void>;
  onDeleteTriggerInput: (interactionId: string, triggerId: string, inputInteractionId: string) => Promise<void>;
}) {
  const rootTrigger = interaction.triggers.find((trigger) => trigger.inputInteractionIds.length === 0);

  function updateLocalInteraction(patch: Partial<Interaction>) {
    onChange(updateInteractionInStory(story, interaction.id, patch));
  }

  return (
    <div>
      <h2>Interaction</h2>
      <label>
        Title
        <input
          value={interaction.title}
          onChange={(e) => updateLocalInteraction({ title: e.target.value })}
          onBlur={(e) => void onPatch(interaction.id, { title: e.target.value })}
        />
      </label>
      <label>
        Content
        <textarea
          rows={7}
          value={interaction.body}
          onChange={(e) => updateLocalInteraction({ body: e.target.value })}
          onBlur={(e) => void onPatch(interaction.id, { body: e.target.value })}
        />
      </label>
      {rootTrigger ? (
        <TriggerInspector
          story={story}
          interaction={interaction}
          trigger={rootTrigger}
          onSaveTrigger={onSaveTrigger}
          onDeleteTrigger={onDeleteTrigger}
          onDeleteTriggerInput={onDeleteTriggerInput}
          showInputs={false}
        />
      ) : (
        <p className="hint">Select an edge to edit path conditions for linked triggers.</p>
      )}
      <hr />
      <button className="danger" onClick={() => void onDelete()}>Delete interaction</button>
    </div>
  );
}
