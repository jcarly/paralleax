import { useCallback, useRef, type RefObject } from 'react';
import type { Position, Story } from '@paralleax/shared';
import type { Connection, OnConnectEnd, OnConnectStart, ReactFlowInstance } from '@xyflow/react';
import {
  interactionNodeHeight,
  interactionNodeWidth,
  type StoryFlowNode,
  type TriggerFlowEdge,
} from '../../../storyGraph';
import { getPendingConnection, getPendingConnectionConflict } from '../../../storyConnection';

interface StoryConnectionControllerDependencies {
  story: Story | undefined;
  flowInstanceRef: RefObject<ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null>;
  connectInteractions: (connection: Connection) => Promise<void>;
  connectToExistingTrigger: (
    sourceId: string,
    targetId: string,
    triggerId: string,
  ) => Promise<void>;
  onConnectionConflict: (conflict: boolean) => void;
  onUnexpectedError: (error: unknown) => void;
  createChildFromInteraction: (sourceId: string, position?: Position) => Promise<void>;
  createParentForInteraction: (targetId: string, position?: Position) => Promise<void>;
}

export function useStoryConnectionController({
  story,
  flowInstanceRef,
  connectInteractions,
  connectToExistingTrigger,
  onConnectionConflict,
  onUnexpectedError,
  createChildFromInteraction,
  createParentForInteraction,
}: StoryConnectionControllerDependencies) {
  const pendingConnectionStart = useRef<{
    nodeId: string;
    handleType: 'source' | 'target';
  } | null>(null);

  const requestConnection = useCallback(
    (connection: Connection) => {
      const conflict = getPendingConnectionConflict(story, connection);
      if (conflict) {
        onConnectionConflict(true);
        return;
      }
      onConnectionConflict(false);
      if (!getPendingConnection(story, connection)) {
        return;
      }
      runConnectionAction(() => connectInteractions(connection), onUnexpectedError);
    },
    [connectInteractions, onConnectionConflict, onUnexpectedError, story],
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
      const existingTriggerConnection = getExistingTriggerConnection(start, event);
      if (existingTriggerConnection) {
        onConnectionConflict(false);
        runConnectionAction(
          () =>
            connectToExistingTrigger(
              existingTriggerConnection.sourceId,
              existingTriggerConnection.targetId,
              existingTriggerConnection.triggerId,
            ),
          onUnexpectedError,
        );
        return;
      }

      if (!start || connectionState.isValid === true || connectionState.toNode) {
        return;
      }
      if (start.handleType === 'source') {
        const position = getDroppedInteractionPosition(event, flowInstanceRef.current, 'child');
        runConnectionAction(
          () => createChildFromInteraction(start.nodeId, position),
          onUnexpectedError,
        );
        return;
      }

      const position = getDroppedInteractionPosition(event, flowInstanceRef.current, 'parent');
      runConnectionAction(
        () => createParentForInteraction(start.nodeId, position),
        onUnexpectedError,
      );
    },
    [
      connectToExistingTrigger,
      createChildFromInteraction,
      createParentForInteraction,
      flowInstanceRef,
      onConnectionConflict,
      onUnexpectedError,
    ],
  );

  return {
    requestConnection,
    startCanvasConnection,
    endCanvasConnection,
  };
}

function runConnectionAction(
  action: () => Promise<void>,
  onUnexpectedError: (error: unknown) => void,
) {
  void action().catch(onUnexpectedError);
}

function getTriggerDropTarget(event: MouseEvent | TouchEvent) {
  const target = event.target instanceof Element ? event.target : null;
  const marker = target?.closest<HTMLElement>('[data-trigger-drop-target="true"]');
  if (!marker) {
    return undefined;
  }
  return {
    interactionId: marker.dataset.interactionId,
    triggerId: marker.dataset.triggerId,
  };
}

function getExistingTriggerConnection(
  start: { nodeId: string; handleType: 'source' | 'target' } | null,
  event: MouseEvent | TouchEvent,
) {
  if (start?.handleType !== 'source') {
    return undefined;
  }
  const target = getTriggerDropTarget(event);
  if (!target?.interactionId || !target.triggerId) {
    return undefined;
  }
  return {
    sourceId: start.nodeId,
    targetId: target.interactionId,
    triggerId: target.triggerId,
  };
}

function getDroppedInteractionPosition(
  event: MouseEvent | TouchEvent,
  flow: ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null,
  placement: 'child' | 'parent',
): Position | undefined {
  if (!flow) {
    return undefined;
  }

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
