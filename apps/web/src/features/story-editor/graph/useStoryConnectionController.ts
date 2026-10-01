import { useCallback, useRef, type RefObject } from 'react';
import type { Position, Story } from '@paralleax/shared';
import type { Connection, OnConnectEnd, OnConnectStart, ReactFlowInstance } from '@xyflow/react';
import {
  interactionNodeHeight,
  interactionNodeWidth,
  type StoryFlowNode,
  type TriggerFlowEdge,
} from '../../../storyGraph';
import { getPendingConnection } from '../../../storyConnection';

interface StoryConnectionControllerDependencies {
  story: Story | undefined;
  flowInstanceRef: RefObject<ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null>;
  connectInteractions: (connection: Connection) => void;
  connectToExistingTrigger: (sourceId: string, targetId: string, triggerId: string) => void;
  createChildFromInteraction: (sourceId: string, position?: Position) => void;
  createParentForInteraction: (targetId: string, position?: Position) => void;
}

export function useStoryConnectionController({
  story,
  flowInstanceRef,
  connectInteractions,
  connectToExistingTrigger,
  createChildFromInteraction,
  createParentForInteraction,
}: StoryConnectionControllerDependencies) {
  const pendingConnectionStart = useRef<{
    nodeId: string;
    handleType: 'source' | 'target';
  } | null>(null);

  const requestConnection = useCallback(
    (connection: Connection) => {
      if (!getPendingConnection(story, connection)) return;
      void connectInteractions(connection);
    },
    [connectInteractions, story],
  );

  const startCanvasConnection = useCallback<OnConnectStart>((_, params) => {
    if (!params.nodeId || !params.handleType) {
      pendingConnectionStart.current = null;
      return;
    }
    pendingConnectionStart.current = {
      nodeId: params.nodeId,
      handleType: params.handleType,
    };
  }, []);

  const endCanvasConnection = useCallback<OnConnectEnd>(
    (event, connectionState) => {
      const start = pendingConnectionStart.current;
      pendingConnectionStart.current = null;
      const triggerDropTarget = getTriggerDropTarget(event);
      if (
        start?.handleType === 'source' &&
        triggerDropTarget?.interactionId &&
        triggerDropTarget.triggerId
      ) {
        void connectToExistingTrigger(
          start.nodeId,
          triggerDropTarget.interactionId,
          triggerDropTarget.triggerId,
        );
        return;
      }

      if (!start || connectionState.isValid === true || connectionState.toNode) return;
      if (start.handleType === 'source') {
        const position = getDroppedInteractionPosition(event, flowInstanceRef.current, 'child');
        void createChildFromInteraction(start.nodeId, position);
        return;
      }

      const position = getDroppedInteractionPosition(event, flowInstanceRef.current, 'parent');
      void createParentForInteraction(start.nodeId, position);
    },
    [
      connectToExistingTrigger,
      createChildFromInteraction,
      createParentForInteraction,
      flowInstanceRef,
    ],
  );

  return {
    requestConnection,
    startCanvasConnection,
    endCanvasConnection,
  };
}

function getTriggerDropTarget(event: MouseEvent | TouchEvent) {
  const target = event.target instanceof Element ? event.target : null;
  const marker = target?.closest<HTMLElement>('[data-trigger-drop-target="true"]');
  if (!marker) return undefined;
  return {
    interactionId: marker.dataset.interactionId,
    triggerId: marker.dataset.triggerId,
  };
}

function getDroppedInteractionPosition(
  event: MouseEvent | TouchEvent,
  flow: ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null,
  placement: 'child' | 'parent',
): Position | undefined {
  if (!flow) return undefined;

  const pointer = 'changedTouches' in event ? event.changedTouches[0] : event;
  const drop = flow.screenToFlowPosition({
    x: pointer.clientX,
    y: pointer.clientY,
  });

  return {
    x: Math.round(drop.x - interactionNodeWidth / 2),
    y: placement === 'child' ? Math.round(drop.y) : Math.round(drop.y - interactionNodeHeight),
  };
}
