import type { StoryFlowNode } from './storyGraph';
import type { StoryGraphLayoutTarget } from './storyGraphLayout';

export interface SelectedGraphTrigger {
  nodeId: string;
  interactionId: string;
  triggerId: string;
  triggerIds: string[];
}

export interface StoryGraphSelection {
  interactionIds: string[];
  triggers: SelectedGraphTrigger[];
}

export function createStoryGraphSelection(
  selectedNodes: readonly StoryFlowNode[],
): StoryGraphSelection | undefined {
  const interactionIds = selectedNodes.flatMap((node) =>
    node.type === 'interaction' ? [node.id] : [],
  );
  const triggers = selectedNodes.flatMap((node) =>
    node.type === 'trigger'
      ? [
          {
            nodeId: node.id,
            interactionId: node.data.interactionId,
            triggerId: node.data.triggerId,
            triggerIds: node.data.triggerIds,
          },
        ]
      : [],
  );

  return interactionIds.length > 0 || triggers.length > 0
    ? { interactionIds, triggers }
    : undefined;
}

export function getStoryGraphSelectionNodeIds(
  selection: StoryGraphSelection | undefined,
): ReadonlySet<string> {
  return new Set([
    ...(selection?.interactionIds ?? []),
    ...(selection?.triggers.map(({ nodeId }) => nodeId) ?? []),
  ]);
}

export function getStoryGraphSelectionTargets(
  selection: StoryGraphSelection | undefined,
): StoryGraphLayoutTarget[] {
  if (!selection) return [];
  return [
    ...selection.interactionIds.map((interactionId): StoryGraphLayoutTarget => ({
      type: 'interaction',
      interactionId,
    })),
    ...selection.triggers.map(({ interactionId, triggerId }): StoryGraphLayoutTarget => ({
      type: 'trigger',
      interactionId,
      triggerId,
    })),
  ];
}

export function applyStoryGraphSelection(
  nodes: readonly StoryFlowNode[],
  selection: StoryGraphSelection | undefined,
): StoryFlowNode[] {
  if (!selection) return [...nodes];
  const selectedNodeIds = getStoryGraphSelectionNodeIds(selection);

  return nodes.map((node) => {
    if (node.type !== 'interaction' && node.type !== 'trigger') return node;
    const selected = selectedNodeIds.has(node.id);
    return {
      ...node,
      selected,
      data: { ...node.data, selected },
    } as StoryFlowNode;
  });
}
