import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  ReactFlow,
  useNodesState,
  type EdgeMouseHandler,
  type OnConnectEnd,
  type OnConnectStart,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from '@xyflow/react';
import { Link, useParams } from 'react-router-dom';
import type { Position } from '@paralleax/shared';
import { InteractionInspector } from '../components/InteractionInspector';
import { InteractionNode } from '../components/InteractionNode';
import { TriggerInspector } from '../components/TriggerInspector';
import { useStoryEditorPersistence } from '../hooks/useStoryEditorPersistence';
import {
  buildInteractionNodes,
  buildTriggerEdges,
  type InteractionFlowNode,
  type SelectedTrigger,
  type TriggerFlowEdge,
} from '../storyGraph';
import { findInteraction, findSelectedTrigger } from '../storySelection';

const nodeTypes = { interaction: InteractionNode };
const droppedNodeOffset = { x: 110, y: 48 };

export function StoryEditor() {
  const { storyId = '' } = useParams();
  const {
    story,
    setStory,
    error,
    renameStory,
    saveTrigger,
    deleteTrigger,
    deleteTriggerInput,
    connectInteractions,
    createRoot,
    createChild,
    createChildFromInteraction,
    createParentForInteraction,
    patchInteraction,
    deleteInteraction,
  } = useStoryEditorPersistence(storyId);
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedTrigger, setSelectedTrigger] = useState<SelectedTrigger>();
  const [nodes, setNodes, onNodesChange] = useNodesState<InteractionFlowNode>([]);
  const pendingConnectionStart = useRef<{
    nodeId: string;
    handleType: 'source' | 'target';
  } | null>(null);
  const flowInstance = useRef<ReactFlowInstance<InteractionFlowNode, TriggerFlowEdge> | null>(null);

  const selected = findInteraction(story, selectedId);
  const selectedTriggerTarget = findSelectedTrigger(story, selectedTrigger);
  const storyNodes = useMemo(
    () =>
      buildInteractionNodes(story, selectedId, {
        onCreateChild: (interactionId) => void createChildFromInteraction(interactionId),
        onCreateParent: (interactionId) => void createParentForInteraction(interactionId),
      }),
    [createChildFromInteraction, createParentForInteraction, selectedId, story],
  );

  useEffect(() => {
    setNodes(storyNodes);
  }, [setNodes, storyNodes]);

  const edges = useMemo(() => buildTriggerEdges(story, selectedTrigger), [story, selectedTrigger]);

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

  const startCanvasConnection: OnConnectStart = (_, params) => {
    if (!params.nodeId || !params.handleType) {
      pendingConnectionStart.current = null;
      return;
    }
    pendingConnectionStart.current = {
      nodeId: params.nodeId,
      handleType: params.handleType,
    };
  };

  const endCanvasConnection: OnConnectEnd = (_, connectionState) => {
    const start = pendingConnectionStart.current;
    pendingConnectionStart.current = null;
    if (!start || connectionState.isValid === true || connectionState.toNode) return;
    const position = getDroppedInteractionPosition(connectionState.pointer, flowInstance.current);

    if (start.handleType === 'source') {
      void createChildFromInteraction(start.nodeId, position);
      return;
    }

    void createParentForInteraction(start.nodeId, position);
  };

  async function deleteSelectedTrigger(interactionId: string, triggerId: string) {
    await deleteTrigger(interactionId, triggerId);
    setSelectedTrigger(undefined);
  }

  async function deleteSelectedTriggerInput(
    interactionId: string,
    triggerId: string,
    inputInteractionId: string,
  ) {
    await deleteTriggerInput(interactionId, triggerId, inputInteractionId);
    setSelectedTrigger(undefined);
  }

  async function createSelectedChild() {
    if (!story || !selected) return;
    await createChild(selected);
  }

  async function remove() {
    if (!selected) return;
    await deleteInteraction(selected.id);
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
          onBlur={(e) => void renameStory(e.target.value)}
        />
        <div className="actions">
          <button disabled={!selected} onClick={() => void createSelectedChild()}>
            Add child
          </button>
          <Link className="button secondary" to={`/stories/${storyId}/play`}>
            Test
          </Link>
        </div>
      </div>
      <div className="editor-layout">
        <section className="canvas">
          <button className="canvas-action" onClick={() => void createRoot()}>
            Add root
          </button>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onInit={(instance) => {
              flowInstance.current = instance;
            }}
            onNodesChange={onNodesChange}
            onConnect={(connection) => void connectInteractions(connection)}
            onConnectStart={startCanvasConnection}
            onConnectEnd={endCanvasConnection}
            onEdgeClick={selectTrigger}
            onNodeClick={select}
            onNodeDragStop={(_, node) =>
              void patchInteraction(node.id, { position: node.position })
            }
            fitView
          >
            <Background />
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
              onDeleteTrigger={deleteSelectedTrigger}
              onDeleteTriggerInput={deleteSelectedTriggerInput}
            />
          ) : selectedTriggerTarget ? (
            <TriggerInspector
              story={story}
              interaction={selectedTriggerTarget.interaction}
              trigger={selectedTriggerTarget.trigger}
              selectedInputInteractionId={selectedTrigger?.inputInteractionId}
              onSaveTrigger={saveTrigger}
              onDeleteTrigger={deleteSelectedTrigger}
              onDeleteTriggerInput={deleteSelectedTriggerInput}
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

function getDroppedInteractionPosition(
  pointer: Position | null,
  flow: ReactFlowInstance<InteractionFlowNode, TriggerFlowEdge> | null,
): Position | undefined {
  if (!pointer || !flow) return undefined;
  const flowPosition = flow.screenToFlowPosition(pointer);
  return {
    x: Math.round(flowPosition.x - droppedNodeOffset.x),
    y: Math.round(flowPosition.y - droppedNodeOffset.y),
  };
}
