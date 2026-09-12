import { describe, expect, it, vi } from 'vitest';
import type { StoryFlowNode, TriggerFlowEdge } from '../../../storyGraph';
import { reconcileStoryFlowEdges, reconcileStoryFlowNodes } from './storyFlowReconciliation';

describe('story Flow reconciliation', () => {
  it('keeps unchanged node references and measured state', () => {
    const onCreateChild = vi.fn();
    const current = interactionNode({
      measured: { width: 210, height: 116 },
      data: { title: 'Start', body: '', selected: false, onCreateChild },
    });
    const projected = interactionNode({
      data: { title: 'Start', body: '', selected: false, onCreateChild },
    });

    const [reconciled] = reconcileStoryFlowNodes([current], [projected]);

    expect(reconciled).toBe(current);
  });

  it('updates only changed nodes while preserving their measurements', () => {
    const unchanged = interactionNode({ id: 'unchanged' });
    const current = interactionNode({ measured: { width: 210, height: 116 } });
    const projected = interactionNode({ data: { title: 'Renamed', body: '', selected: false } });

    const reconciled = reconcileStoryFlowNodes([unchanged, current], [unchanged, projected]);

    expect(reconciled[0]).toBe(unchanged);
    expect(reconciled[1]).not.toBe(current);
    expect(reconciled[1].data.title).toBe('Renamed');
    expect(reconciled[1].measured).toEqual({ width: 210, height: 116 });
  });

  it('drops removed projected state and nodes', () => {
    const selected = interactionNode({ selected: true });
    const removed = interactionNode({ id: 'removed' });
    const projected = interactionNode();

    const reconciled = reconcileStoryFlowNodes([selected, removed], [projected]);

    expect(reconciled).toEqual([projected]);
    expect(reconciled[0]).not.toHaveProperty('selected');
  });

  it('keeps unchanged edge references despite newly projected nested arrays', () => {
    const current = triggerEdge();
    const projected = triggerEdge();

    const [reconciled] = reconcileStoryFlowEdges([current], [projected]);

    expect(reconciled).toBe(current);
  });
});

function interactionNode(
  overrides: Partial<StoryFlowNode> = {},
): Extract<StoryFlowNode, { type: 'interaction' }> {
  return {
    id: 'interaction-1',
    type: 'interaction',
    position: { x: 80, y: 120 },
    data: { title: 'Start', body: '', selected: false },
    ...overrides,
  } as Extract<StoryFlowNode, { type: 'interaction' }>;
}

function triggerEdge(): TriggerFlowEdge {
  return {
    id: 'edge-1',
    type: 'trigger',
    source: 'source',
    target: 'target',
    data: {
      interactionId: 'target',
      triggerId: 'trigger-1',
      triggerIds: ['trigger-1'],
      selected: false,
      conditionCount: 0,
    },
  };
}
