import { act, renderHook } from '@testing-library/react';
import type { Connection, OnConnectEnd, ReactFlowInstance } from '@xyflow/react';
import { describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import type { StoryFlowNode, TriggerFlowEdge } from '../../../storyGraph';
import { useStoryConnectionController } from './useStoryConnectionController';

describe('story connection controller', () => {
  it('immediately creates a dedicated trigger through the input plus handle', () => {
    const { actions, result } = renderController();
    const connection = connect('source', 'target');

    act(() => result.current.requestConnection(connection));

    expect(actions.connectInteractions).toHaveBeenCalledWith(connection);
    expect(actions.connectToExistingTrigger).not.toHaveBeenCalled();
  });

  it('ignores a connection that does not target the input plus handle', () => {
    const { actions, result } = renderController();
    const connection = {
      ...connect('source', 'target'),
      targetHandle: 'routing-input-top',
    };

    act(() => result.current.requestConnection(connection));

    expect(actions.connectInteractions).not.toHaveBeenCalled();
    expect(actions.connectToExistingTrigger).not.toHaveBeenCalled();
  });

  it('creates positioned child and parent interactions after empty-canvas drops', () => {
    const { actions, result } = renderController();

    act(() =>
      result.current.startCanvasConnection(mouseEvent(580, 452), {
        nodeId: 'source',
        handleType: 'source',
        handleId: null,
      }),
    );
    act(() => result.current.endCanvasConnection(mouseEvent(580, 452), emptyConnectionState()));
    expect(actions.createChildFromInteraction).toHaveBeenCalledWith('source', {
      x: 475,
      y: 452,
    });
    act(() =>
      result.current.startCanvasConnection(mouseEvent(320, 328), {
        nodeId: 'target',
        handleType: 'target',
        handleId: null,
      }),
    );
    act(() => result.current.endCanvasConnection(mouseEvent(320, 328), emptyConnectionState()));
    expect(actions.createParentForInteraction).toHaveBeenCalledWith('target', {
      x: 215,
      y: 212,
    });
  });

  it('uses a trigger marker drop as the explicit existing-trigger shortcut', () => {
    const { actions, result } = renderController();
    const marker = document.createElement('button');
    marker.dataset.triggerDropTarget = 'true';
    marker.dataset.interactionId = 'target';
    marker.dataset.triggerId = 'target-trigger';

    act(() =>
      result.current.startCanvasConnection(mouseEvent(0, 0), {
        nodeId: 'source',
        handleType: 'source',
        handleId: null,
      }),
    );
    act(() => result.current.endCanvasConnection(mouseEvent(0, 0, marker), emptyConnectionState()));

    expect(actions.connectToExistingTrigger).toHaveBeenCalledWith(
      'source',
      'target',
      'target-trigger',
    );
    expect(actions.createChildFromInteraction).not.toHaveBeenCalled();
  });

  it('does not create an interaction after a completed or unstarted connection', () => {
    const { actions, result } = renderController();

    act(() => result.current.endCanvasConnection(mouseEvent(0, 0), emptyConnectionState()));
    act(() =>
      result.current.startCanvasConnection(mouseEvent(0, 0), {
        nodeId: 'source',
        handleType: 'source',
        handleId: null,
      }),
    );
    act(() => result.current.endCanvasConnection(mouseEvent(0, 0), connectionState(true)));

    expect(actions.createChildFromInteraction).not.toHaveBeenCalled();
    expect(actions.createParentForInteraction).not.toHaveBeenCalled();
  });
});

function renderController() {
  const actions = {
    connectInteractions: vi.fn<(connection: Connection) => void>(),
    connectToExistingTrigger:
      vi.fn<(sourceId: string, targetId: string, triggerId: string) => void>(),
    createChildFromInteraction: vi.fn(),
    createParentForInteraction: vi.fn(),
  };
  const flowInstanceRef = {
    current: {
      screenToFlowPosition: ({ x, y }: { x: number; y: number }) => ({ x, y }),
    } as ReactFlowInstance<StoryFlowNode, TriggerFlowEdge>,
  };
  const hook = renderHook(() =>
    useStoryConnectionController({
      story: storyFixture(),
      flowInstanceRef,
      ...actions,
    }),
  );
  return { actions, ...hook };
}

function connect(source: string, target: string): Connection {
  return {
    source,
    target,
    sourceHandle: null,
    targetHandle: 'create-source-input',
  };
}

function mouseEvent(clientX: number, clientY: number, target?: Element) {
  const event = new MouseEvent('mouseup', { clientX, clientY });
  if (target) Object.defineProperty(event, 'target', { value: target });
  return event;
}

function emptyConnectionState(): Parameters<OnConnectEnd>[1] {
  return connectionState(null);
}

function connectionState(isValid: boolean | null): Parameters<OnConnectEnd>[1] {
  return {
    isValid,
    fromNode: null,
    fromHandle: null,
    toNode: null,
    toHandle: null,
  } as unknown as Parameters<OnConnectEnd>[1];
}

function storyFixture(): Story {
  return {
    id: 'story-1',
    title: 'Connections',
    createdAt: '2026-08-26T08:00:00.000Z',
    updatedAt: '2026-08-26T08:00:00.000Z',
    interactions: [
      {
        id: 'source',
        title: 'Source',
        body: '',
        position: { x: 0, y: 0 },
        triggers: [{ id: 'source-trigger', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'target',
        title: 'Target',
        body: '',
        position: { x: 0, y: 200 },
        triggers: [
          {
            id: 'target-trigger',
            inputInteractionIds: ['other'],
            conditions: [],
          },
        ],
      },
      {
        id: 'empty-target',
        title: 'Empty target',
        body: '',
        position: { x: 0, y: 400 },
        triggers: [],
      },
      {
        id: 'other',
        title: 'Other',
        body: '',
        position: { x: 200, y: 0 },
        triggers: [{ id: 'other-trigger', inputInteractionIds: [], conditions: [] }],
      },
    ],
  };
}
