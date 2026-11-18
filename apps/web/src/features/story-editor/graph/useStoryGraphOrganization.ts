import type { Dispatch, SetStateAction } from 'react';
import type { ReactFlowInstance } from '@xyflow/react';
import type { Interaction, Story, Trigger } from '@paralleax/shared';
import type { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import type { StoryFlowNode, TriggerFlowEdge } from '../../../storyGraph';
import type { StoryGraphLayoutScope, StoryGraphLayoutTarget } from '../../../storyGraphLayout';
import {
  getStoryGraphSelectionTargets,
  type StoryGraphSelection,
} from '../../../storyGraphSelection';
import type { TriggerEdgeRoutes } from '../../../triggerEdgeRouting';

export function getStoryGraphLayoutTargets(
  graphSelection: StoryGraphSelection | undefined,
  selected: Interaction | undefined,
  selectedTriggerTarget: { interaction: Interaction; trigger: Trigger } | undefined,
): StoryGraphLayoutTarget[] {
  const graphSelectionTargets = getStoryGraphSelectionTargets(graphSelection);
  if (graphSelectionTargets.length > 0) {
    return graphSelectionTargets;
  }
  if (selected) {
    return [{ type: 'interaction', interactionId: selected.id }];
  }
  if (!selectedTriggerTarget) {
    return [];
  }
  return layoutTargetsForTrigger(selectedTriggerTarget);
}

function layoutTargetsForTrigger(target: { interaction: Interaction; trigger: Trigger }) {
  return target.trigger.inputInteractionIds.length === 0
    ? [{ type: 'interaction' as const, interactionId: target.interaction.id }]
    : [
        {
          type: 'trigger' as const,
          interactionId: target.interaction.id,
          triggerId: target.trigger.id,
        },
      ];
}

type StoryGraphOrganizationInput = {
  story: Story | undefined;
  nodes: StoryFlowNode[];
  selectedLayoutTargets: StoryGraphLayoutTarget[];
  organizingRef: { current: boolean };
  setIsOrganizing: (organizing: boolean) => void;
  setFailedOrganizationScope: (scope: 'all' | 'selection' | undefined) => void;
  getFlowInstance: () => ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null;
  setElkEdgeRoutes: Dispatch<SetStateAction<TriggerEdgeRoutes>>;
  beginLocalEdit: () => void;
  endLocalEdit: () => void;
  saveGraphPositions: ReturnType<typeof useStoryEditorPersistence>['saveGraphPositions'];
};

async function runStoryGraphOrganization(
  input: StoryGraphOrganizationInput,
  preference: 'auto' | 'all' | 'selection' = 'auto',
) {
  const story = input.story;
  if (input.organizingRef.current || !story || story.interactions.length === 0) {
    return;
  }
  if (preference === 'selection' && input.selectedLayoutTargets.length === 0) {
    return;
  }
  const scope: StoryGraphLayoutScope =
    preference !== 'all' && input.selectedLayoutTargets.length > 0
      ? { kind: 'selection', targets: input.selectedLayoutTargets }
      : { kind: 'all' };
  input.organizingRef.current = true;
  input.setIsOrganizing(true);
  input.setFailedOrganizationScope(undefined);
  try {
    await runGraphOrganization({
      story,
      nodes: input.nodes,
      scope,
      getFlowInstance: input.getFlowInstance,
      setElkEdgeRoutes: input.setElkEdgeRoutes,
      beginLocalEdit: input.beginLocalEdit,
      endLocalEdit: input.endLocalEdit,
      saveGraphPositions: input.saveGraphPositions,
    });
  } catch {
    input.setFailedOrganizationScope(scope.kind);
  } finally {
    input.organizingRef.current = false;
    input.setIsOrganizing(false);
  }
}

export function useStoryGraphOrganization(input: StoryGraphOrganizationInput) {
  return (preference: 'auto' | 'all' | 'selection' = 'auto') =>
    runStoryGraphOrganization(input, preference);
}

function waitForGraphPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        resolve();
      }),
    );
  });
}

function fitOrganizedGraph(
  affectedNodeIds: string[],
  scope: StoryGraphLayoutScope,
  getFlowInstance: () => ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null,
) {
  if (affectedNodeIds.length === 0) {
    return;
  }
  void getFlowInstance()?.fitView({
    nodes: affectedNodeIds.map((id) => ({ id })),
    duration: 250,
    padding: scope.kind === 'all' ? 0.18 : 0.7,
    maxZoom: 1,
  });
}

async function runGraphOrganization(input: {
  story: Story;
  nodes: StoryFlowNode[];
  scope: StoryGraphLayoutScope;
  getFlowInstance: () => ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null;
  setElkEdgeRoutes: (routes: TriggerEdgeRoutes) => void;
  beginLocalEdit: () => void;
  endLocalEdit: () => void;
  saveGraphPositions: ReturnType<typeof useStoryEditorPersistence>['saveGraphPositions'];
}) {
  const { computeStoryGraphElkLayout } = await import('../../../storyGraphElkLayout');
  await waitForGraphPaint();
  const layout = await computeStoryGraphElkLayout(input.story, {
    interactionSizes: getMeasuredInteractionSizes(input.nodes),
    scope: input.scope,
  });
  input.setElkEdgeRoutes(input.scope.kind === 'all' ? (layout.edgeRoutes ?? new Map()) : new Map());

  const hasPositionUpdates =
    layout.interactionUpdates.length > 0 || layout.triggerUpdates.length > 0;
  try {
    if (hasPositionUpdates) {
      input.beginLocalEdit();
    }
    window.requestAnimationFrame(() => {
      fitOrganizedGraph(layout.affectedNodeIds, input.scope, input.getFlowInstance);
    });
    await input.saveGraphPositions({
      interactionUpdates: layout.interactionUpdates,
      triggerUpdates: layout.triggerUpdates,
    });
  } finally {
    if (hasPositionUpdates) {
      input.endLocalEdit();
    }
  }
}

function getMeasuredInteractionSizes(nodes: StoryFlowNode[]) {
  return new Map(
    nodes.flatMap((node) =>
      node.type === 'interaction' &&
      typeof node.measured?.width === 'number' &&
      typeof node.measured.height === 'number'
        ? [[node.id, { width: node.measured.width, height: node.measured.height }] as const]
        : [],
    ),
  );
}
