import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { TriggerEdge } from '../components/TriggerEdge';
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
const edgeTypes = { trigger: TriggerEdge };
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
  const hasInspectorSelection = Boolean(selected || selectedTriggerTarget);

  const closeInspector = useCallback(() => {
    setSelectedId(undefined);
    setSelectedTrigger(undefined);
  }, []);

  const storyNodes = useMemo(
    () =>
      buildInteractionNodes(story, selectedId, {
        onCreateChild: (interactionId) => void createChildFromInteraction(interactionId),
        onCreateParent: (interactionId) => void createParentForInteraction(interactionId),
        onSelectRootTrigger: (interactionId, triggerId) => {
          closeInspector();
          setSelectedTrigger({ interactionId, triggerId });
        },
      }),
    [closeInspector, createChildFromInteraction, createParentForInteraction, selectedId, story],
  );

  useEffect(() => {
    setNodes(storyNodes);
  }, [setNodes, storyNodes]);

  const selectTrigger: EdgeMouseHandler = (_, edge) => {
    const data = edge.data as Partial<SelectedTrigger> | undefined;
    if (!data?.interactionId || !data.triggerId) return;
    closeInspector();
    setSelectedTrigger({
      interactionId: data.interactionId,
      triggerId: data.triggerId,
      inputInteractionId: data.inputInteractionId,
    });
  };
  const selectTriggerData = useCallback(
    (trigger: SelectedTrigger) => {
      closeInspector();
      setSelectedTrigger(trigger);
    },
    [closeInspector],
  );
  const edges = useMemo(
    () => buildTriggerEdges(story, selectedTrigger, selectTriggerData),
    [selectTriggerData, story, selectedTrigger],
  );

  const select: NodeMouseHandler = (_, node) => {
    closeInspector();
    setSelectedId(node.id);
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
      <div className={`editor-layout ${hasInspectorSelection ? 'with-inspector' : ''}`}>
        <section className="canvas">
          <button className="canvas-action" onClick={() => void createRoot()}>
            Add root
          </button>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(instance) => {
              flowInstance.current = instance;
            }}
            onNodesChange={onNodesChange}
            onConnect={(connection) => void connectInteractions(connection)}
            onConnectStart={startCanvasConnection}
            onConnectEnd={endCanvasConnection}
            onEdgeClick={selectTrigger}
            onNodeClick={select}
            onPaneClick={closeInspector}
            onNodeDragStop={(_, node) =>
              void patchInteraction(node.id, { position: node.position })
            }
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </section>
        {hasInspectorSelection ? (
          <aside className="inspector" aria-label="Inspector">
            <div className="inspector-header">
              <button
                className="ghost inspector-close"
                type="button"
                aria-label="Close inspector"
                onClick={closeInspector}
              >
                x
              </button>
            </div>
            {selected ? (
              <InteractionInspector
                story={story}
                interaction={selected}
                onChange={(next) => setStory(next)}
                onPatch={patchInteraction}
                onDelete={remove}
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
            ) : null}
          </aside>
        ) : null}
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
