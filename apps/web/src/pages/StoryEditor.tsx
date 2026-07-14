import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useNodesState,
  type Connection,
  type EdgeMouseHandler,
  type NodeMouseHandler,
} from '@xyflow/react';
import { Link, useParams } from 'react-router-dom';
import {
  deleteTriggerInStory,
  getNextChildPosition,
  mergeServerStory,
  updateInteractionInStory,
  updateTriggerInStory,
  type InteractionContentPatch,
  type Story,
  type TriggerCondition,
} from '@paralleax/shared';
import { api } from '../api';
import { InteractionInspector } from '../components/InteractionInspector';
import { InteractionNode } from '../components/InteractionNode';
import { TriggerInspector } from '../components/TriggerInspector';
import { findCreatedTrigger, getPendingConnection } from '../storyConnection';
import {
  buildInteractionNodes,
  buildTriggerEdges,
  type InteractionFlowNode,
  type SelectedTrigger,
} from '../storyGraph';
import { findInteraction, findSelectedTrigger } from '../storySelection';
import { planTriggerInputDeletion } from '../storyTriggerInput';

const nodeTypes = { interaction: InteractionNode };

export function StoryEditor() {
  const { storyId = '' } = useParams();
  const [story, setStory] = useState<Story>();
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedTrigger, setSelectedTrigger] = useState<SelectedTrigger>();
  const [error, setError] = useState('');
  const [nodes, setNodes, onNodesChange] = useNodesState<InteractionFlowNode>([]);
  const deletedTriggerIds = useRef(new Set<string>());

  const load = useCallback(
    () =>
      api
        .getStory(storyId)
        .then((next) => {
          deletedTriggerIds.current.clear();
          setStory(next);
        })
        .catch((e: Error) => setError(e.message)),
    [storyId],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const selected = findInteraction(story, selectedId);
  const selectedTriggerTarget = findSelectedTrigger(story, selectedTrigger);
  const storyNodes = useMemo(() => buildInteractionNodes(story, selectedId), [story, selectedId]);

  useEffect(() => {
    setNodes(storyNodes);
  }, [setNodes, storyNodes]);

  const edges = useMemo(() => buildTriggerEdges(story), [story]);

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
    setStory((current) =>
      current ? updateTriggerInStory(current, interactionId, triggerId, patch) : current,
    );
    const next = await api.updateTrigger(storyId, interactionId, triggerId, patch);
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
  }

  async function deleteTrigger(interactionId: string, triggerId: string) {
    deletedTriggerIds.current.add(triggerId);
    setStory((current) =>
      current ? deleteTriggerInStory(current, interactionId, triggerId) : current,
    );
    const next = await api.deleteTrigger(storyId, interactionId, triggerId);
    setStory((current) => (current ? mergeIncomingStory(current, next) : next));
    setSelectedTrigger(undefined);
  }

  async function deleteTriggerInput(
    interactionId: string,
    triggerId: string,
    inputInteractionId: string,
  ) {
    const plan = planTriggerInputDeletion(story, interactionId, triggerId, inputInteractionId);
    if (!plan) return;

    if (plan.action === 'delete-trigger') {
      await deleteTrigger(interactionId, triggerId);
      return;
    }

    await saveTrigger(interactionId, triggerId, plan.inputInteractionIds, plan.conditions);
    setSelectedTrigger(undefined);
  }

  const connectInteractions = useCallback(
    async (connection: Connection) => {
      const pending = getPendingConnection(story, connection);
      if (!pending) return;

      const withTrigger = await api.addTrigger(storyId, pending.target.id);
      const nextTrigger = findCreatedTrigger(
        withTrigger,
        pending.target.id,
        pending.existingTriggerIds,
      );
      if (!nextTrigger) {
        setStory((current) => (current ? mergeIncomingStory(current, withTrigger) : withTrigger));
        return;
      }

      const updated = await api.updateTrigger(storyId, pending.target.id, nextTrigger.id, {
        inputInteractionIds: [pending.sourceId],
        conditions: nextTrigger.conditions,
      });
      setStory((current) => (current ? mergeIncomingStory(current, updated) : updated));
    },
    [story, storyId],
  );

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
      return mergeIncomingStory(
        current,
        updated,
        { interactionId: id, patch },
        { preserveCurrentTriggers: true },
      );
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
          onBlur={(e) =>
            void api.renameStory(storyId, e.target.value).then((next) => {
              setStory((current) => (current ? mergeIncomingStory(current, next) : next));
            })
          }
        />
        <div className="actions">
          <button onClick={() => void createRoot()}>Add root</button>
          <button disabled={!selected} onClick={() => void createChild()}>
            Add child
          </button>
          <Link className="button secondary" to={`/stories/${storyId}/play`}>
            Test
          </Link>
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
            onNodeDragStop={(_, node) =>
              void patchInteraction(node.id, { position: node.position })
            }
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
          ) : selectedTriggerTarget ? (
            <TriggerInspector
              story={story}
              interaction={selectedTriggerTarget.interaction}
              trigger={selectedTriggerTarget.trigger}
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
