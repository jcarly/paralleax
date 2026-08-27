/* eslint-disable react-refresh/only-export-components */
import React, { type ComponentType } from 'react';
import {
  type Edge,
  type FinalConnectionState,
  type HandleProps,
  type Node,
  type NodeProps,
  type NodeResizerProps,
  type ReactFlowInstance,
  type ReactFlowProps,
  type ResizeDragEvent,
} from '@xyflow/react';
import { vi } from 'vitest';

type TestNodeData = Record<string, unknown> & {
  interactionId?: string;
  rootTriggerId?: string;
  triggerId?: string;
};

type TestEdgeData = Record<string, unknown> & {
  inputInteractionId?: string;
  interactionId?: string;
  onDeleteTriggerInput?: (
    interactionId: string,
    triggerId: string,
    inputInteractionId: string,
  ) => void;
  triggerId?: string;
  triggerIds?: string[];
};

type TestFlowNode = Node<TestNodeData>;
type TestFlowEdge = Edge<TestEdgeData>;

const disconnectedState: FinalConnectionState = {
  isValid: null,
  from: null,
  fromHandle: null,
  fromPosition: null,
  fromNode: null,
  to: null,
  toHandle: null,
  toPosition: null,
  toNode: null,
  pointer: null,
};

function TestHandle({
  children,
  type,
  id,
  position: _position,
  isConnectable: _isConnectable,
  isConnectableStart: _isConnectableStart,
  isConnectableEnd: _isConnectableEnd,
  isValidConnection: _isValidConnection,
  onConnect: _onConnect,
  ...domProps
}: HandleProps) {
  return (
    <div {...domProps} id={id ?? undefined} data-testid={`handle-${type}`}>
      {children}
    </div>
  );
}

function TestNodeResizer({ isVisible, onResizeEnd }: NodeResizerProps) {
  return isVisible ? (
    <button
      data-testid="resize-decoration"
      onClick={() =>
        onResizeEnd?.({} as ResizeDragEvent, {
          x: 0,
          y: 0,
          width: 500,
          height: 320,
        })
      }
    />
  ) : null;
}

function TestReactFlow({
  nodes = [],
  edges = [],
  nodeTypes = {},
  onInit,
  onConnect,
  onConnectStart,
  onConnectEnd,
  onNodeClick,
  onNodeDragStart,
  onNodeDrag,
  onPaneClick,
  onPaneContextMenu,
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
}: ReactFlowProps<TestFlowNode, TestFlowEdge>) {
  const onInitRef = React.useRef(onInit);
  React.useEffect(() => {
    onInitRef.current?.({
      screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({
        x: x - 50,
        y: y - 40,
      }),
      fitView: vi.fn(),
    } as unknown as ReactFlowInstance<TestFlowNode, TestFlowEdge>);
  }, []);

  return (
    <div
      data-testid="react-flow"
      data-min-zoom={minZoom}
      data-pan-on-drag={JSON.stringify(panOnDrag)}
      data-pan-activation-key={
        typeof panActivationKeyCode === 'string' ? panActivationKeyCode : undefined
      }
      data-selection-on-drag={selectionOnDrag}
      data-selection-mode={selectionMode}
    >
      <button
        data-testid="flow-pane"
        onClick={(event) => onPaneClick?.(event)}
        onContextMenu={(event) => onPaneContextMenu?.(event)}
      />
      <button
        data-testid="box-select-first-branch"
        onClick={(event) => {
          const selectedNodes = nodes.filter((node) =>
            ['interaction-1', 'interaction-2', 'trigger:interaction-2:trigger-2'].includes(node.id),
          );
          onSelectionStart?.(event);
          onSelectionChange?.({ nodes: selectedNodes, edges: [] });
          onSelectionEnd?.(event);
        }}
      />
      {nodes.map((node) => {
        const NodeComponent = nodeTypes[node.type ?? 'default'] as
          ComponentType<NodeProps<TestFlowNode>> | undefined;
        if (!NodeComponent) return null;

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
            <NodeComponent
              id={node.id}
              data={node.data}
              type={node.type ?? 'default'}
              selected={node.selected ?? false}
              dragging={node.dragging ?? false}
              draggable={node.draggable ?? true}
              selectable={node.selectable ?? true}
              deletable={node.deletable ?? true}
              isConnectable={node.connectable ?? true}
              positionAbsoluteX={node.position.x}
              positionAbsoluteY={node.position.y}
              zIndex={node.zIndex ?? 0}
              parentId={node.parentId}
              width={node.measured?.width}
              height={node.measured?.height}
              sourcePosition={node.sourcePosition}
              targetPosition={node.targetPosition}
            />
            <span
              data-testid={`preview-drag-node-${node.id}`}
              onClick={(event) => {
                event.stopPropagation();
                const movedNodes = (
                  node.selected ? nodes.filter((candidate) => candidate.selected) : [node]
                ).map((candidate) => ({
                  ...candidate,
                  position: {
                    x: candidate.position.x + 100,
                    y: candidate.position.y + 80,
                  },
                }));
                const movedNode = movedNodes.find((candidate) => candidate.id === node.id);
                if (movedNode) onNodeDrag?.(event.nativeEvent, movedNode, movedNodes);
              }}
            />
            <span
              data-testid={`drag-node-${node.id}`}
              onClick={(event) => {
                event.stopPropagation();
                const selectedNodes = node.selected
                  ? nodes.filter((candidate) => candidate.selected)
                  : [node];
                const movedNodes = selectedNodes.map((candidate) => ({
                  ...candidate,
                  position: {
                    x: candidate.position.x + 25,
                    y: candidate.position.y + 15,
                  },
                }));
                const movedNode = movedNodes.find((candidate) => candidate.id === node.id);
                if (!movedNode) return;
                onNodeDragStart?.(event.nativeEvent, node, selectedNodes);
                onNodeDragStop?.(event.nativeEvent, movedNode, movedNodes);
              }}
            />
            <span
              data-testid={`drop-source-${node.id}`}
              onClick={(event) => {
                event.stopPropagation();
                onConnectStart?.(event.nativeEvent, {
                  nodeId: node.id,
                  handleId: null,
                  handleType: 'source',
                });
                onConnectEnd?.(event.nativeEvent, {
                  ...disconnectedState,
                  pointer: { x: 580, y: 452 },
                } as FinalConnectionState);
              }}
            />
            <span
              data-testid={`begin-source-${node.id}`}
              onClick={(event) => {
                event.stopPropagation();
                onConnectStart?.(event.nativeEvent, {
                  nodeId: node.id,
                  handleId: null,
                  handleType: 'source',
                });
              }}
            />
            <span
              data-testid={`drop-target-${node.id}`}
              onClick={(event) => {
                event.stopPropagation();
                onConnectStart?.(event.nativeEvent, {
                  nodeId: node.id,
                  handleId: null,
                  handleType: 'target',
                });
                onConnectEnd?.(event.nativeEvent, {
                  ...disconnectedState,
                  pointer: { x: 320, y: 328 },
                } as FinalConnectionState);
              }}
            />
          </div>
        );
      })}
      {nodes.flatMap((source) =>
        nodes
          .filter((target) => target.id !== source.id)
          .map((target) => (
            <button
              key={`${source.id}-${target.id}`}
              data-testid={`connect-${source.id}-${target.id}`}
              onClick={() =>
                onConnect?.({
                  source: source.id,
                  sourceHandle: null,
                  target: target.id,
                  targetHandle: null,
                })
              }
            />
          )),
      )}
      {edges.map((edge) => (
        <div key={edge.id}>
          <button
            className={edge.className}
            data-testid={
              edge.data?.inputInteractionId
                ? `flow-edge-${edge.data.inputInteractionId}-${edge.data.interactionId}`
                : `flow-edge-${edge.source}-${edge.target}`
            }
          />
          {edge.data?.inputInteractionId && edge.data.interactionId ? (
            <button
              data-testid={`delete-link-${edge.data.inputInteractionId}-${edge.data.interactionId}`}
              onClick={() =>
                (edge.data?.triggerIds ?? [edge.data?.triggerId]).forEach((triggerId) => {
                  if (triggerId && edge.data?.inputInteractionId && edge.data.interactionId) {
                    edge.data.onDeleteTriggerInput?.(
                      edge.data.interactionId,
                      triggerId,
                      edge.data.inputInteractionId,
                    );
                  }
                })
              }
            />
          ) : null}
        </div>
      ))}
      {nodes
        .filter((node) => node.type === 'trigger')
        .flatMap((triggerNode) =>
          nodes
            .filter((node) => node.type === 'interaction')
            .filter((node) => node.id !== triggerNode.data.interactionId)
            .map((node) => (
              <button
                key={`${node.id}-${triggerNode.id}`}
                data-testid={`drop-source-${node.id}-on-trigger-${triggerNode.data.interactionId}`}
                data-trigger-drop-target="true"
                data-interaction-id={triggerNode.data.interactionId}
                data-trigger-id={triggerNode.data.triggerId}
                onClick={(event) => {
                  onConnectStart?.(event.nativeEvent, {
                    nodeId: node.id,
                    handleId: null,
                    handleType: 'source',
                  });
                  onConnectEnd?.(event.nativeEvent, disconnectedState);
                }}
              />
            )),
        )}
      {nodes
        .filter((node) => node.type === 'interaction' && node.data.rootTriggerId)
        .flatMap((targetNode) =>
          nodes
            .filter((node) => node.type === 'interaction')
            .filter((sourceNode) => sourceNode.id !== targetNode.id)
            .map((sourceNode) => (
              <button
                key={`${sourceNode.id}-${targetNode.id}-${targetNode.data.rootTriggerId}`}
                data-testid={`drop-source-${sourceNode.id}-on-root-trigger-${targetNode.id}`}
                data-trigger-drop-target="true"
                data-interaction-id={targetNode.id}
                data-trigger-id={targetNode.data.rootTriggerId}
                onClick={(event) => {
                  onConnectStart?.(event.nativeEvent, {
                    nodeId: sourceNode.id,
                    handleId: null,
                    handleType: 'source',
                  });
                  onConnectEnd?.(event.nativeEvent, disconnectedState);
                }}
              />
            )),
        )}
      {children}
    </div>
  );
}

function useTestNodesState<NodeType extends Node>(initialNodes: NodeType[]) {
  const [nodes, setNodes] = React.useState(initialNodes);
  return [nodes, setNodes, vi.fn()] as const;
}

function useTestEdgesState<EdgeType extends Edge>(initialEdges: EdgeType[]) {
  const [edges, setEdges] = React.useState(initialEdges);
  return [edges, setEdges, vi.fn()] as const;
}

export function createReactFlowMock() {
  return {
    Background: () => <div data-testid="flow-background" />,
    Controls: () => <div data-testid="flow-controls" />,
    Handle: TestHandle,
    MarkerType: { ArrowClosed: 'arrowclosed' },
    MiniMap: () => <div data-testid="flow-minimap" />,
    NodeResizer: TestNodeResizer,
    Position: { Bottom: 'bottom', Left: 'left', Right: 'right', Top: 'top' },
    ReactFlow: TestReactFlow,
    SelectionMode: { Full: 'full', Partial: 'partial' },
    useNodesState: useTestNodesState,
    useEdgesState: useTestEdgesState,
  };
}
