import { useCallback } from 'react';
import type { useTranslation } from 'react-i18next';
import type { ReactFlowInstance } from '@xyflow/react';
import type { GraphDecoration, Position } from '@paralleax/shared';
import type { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import type { StoryFlowNode, TriggerFlowEdge } from '../../../storyGraph';
import type { useStoryContextNavigation } from '../navigation/useStoryContextNavigation';
import {
  useStoryEditorGroupActions,
  useStoryEditorGroupShortcut,
} from '../navigation/useStoryEditorGroupActions';
import type { StoryEditorExclusiveSelection } from '../selection/useStoryEditorSelection';
import type { useStoryEditorSelectionModel } from '../selection/useStoryEditorSelectionModel';
import { useStoryEditorEntityActions } from '../useStoryEditorEntityActions';
import type {
  useStoryEditorPersistenceModel,
  useStoryEditorLocalUiState,
} from '../runtime/useStoryEditorBaseRuntime';
import type { useStoryEditorCanvasState } from './useStoryEditorCanvasState';
import {
  useStoryEditorDeleteShortcut,
  useStoryEditorGraphDeletion,
} from './useStoryEditorGraphDeletion';
import { getStoryGraphLayoutTargets, useStoryGraphOrganization } from './useStoryGraphOrganization';

type StoryEditorDecorationActionInput = {
  canvasRef: React.RefObject<HTMLElement | null>;
  flowInstanceRef: React.MutableRefObject<ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null>;
  createGraphDecoration: ReturnType<typeof useStoryEditorPersistence>['createGraphDecoration'];
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
};

function useStoryEditorDecorationAction({
  canvasRef,
  flowInstanceRef,
  createGraphDecoration,
  selectExclusive,
}: StoryEditorDecorationActionInput) {
  return useCallback(
    async (kind: GraphDecoration['kind'], anchorPosition?: Position) => {
      const bounds = canvasRef.current?.getBoundingClientRect();
      const center =
        anchorPosition ??
        flowInstanceRef.current?.screenToFlowPosition({
          x: bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2,
          y: bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2,
        });
      const position = center
        ? kind === 'frame'
          ? { x: center.x - 210, y: center.y - 120 }
          : center
        : { x: 80, y: 80 };
      const decorationId = await createGraphDecoration(kind, position);
      if (decorationId !== undefined && decorationId.length > 0) {
        selectExclusive({ type: 'graphDecoration', id: decorationId });
      }
    },
    [canvasRef, createGraphDecoration, flowInstanceRef, selectExclusive],
  );
}

type StoryEditorActionModelInput = {
  persistence: ReturnType<typeof useStoryEditorPersistenceModel>;
  uiState: ReturnType<typeof useStoryEditorLocalUiState>;
  canvasState: ReturnType<typeof useStoryEditorCanvasState>;
  selection: ReturnType<typeof useStoryEditorSelectionModel>;
  contextNavigation: ReturnType<typeof useStoryContextNavigation>;
  reviewOnly: boolean;
  t: ReturnType<typeof useTranslation>['t'];
};

export function useStoryEditorActionModel(input: StoryEditorActionModelInput) {
  const groupActions = useStoryEditorGroupActionModel(input);
  const graphActions = useStoryEditorGraphActionModel(input);
  const entityActions = useStoryEditorEntityActionModel(input);
  return { ...groupActions, ...graphActions, ...entityActions };
}

function useStoryEditorGroupActionModel({
  persistence,
  uiState,
  selection,
  contextNavigation,
  reviewOnly,
  t,
}: StoryEditorActionModelInput) {
  const createEditorGroup = useStoryEditorGroupActions({
    createGroup: persistence.createGroup,
    creatingGroupRef: uiState.creatingGroupRef,
    clearSearch: contextNavigation.clearSearch,
    openContextPanel: contextNavigation.openContextPanel,
    openContextSection: contextNavigation.openContextSection,
    setCommentsOpen: uiState.setCommentsOpen,
    selectExclusive: selection.selectExclusive,
    setEditingGroupId: uiState.setEditingGroupId,
  });
  useStoryEditorGroupShortcut({
    createEditorGroup,
    graphSelection: selection.graphSelection,
    reviewOnly,
    selectedId: selection.selectedId,
    setCommentsOpen: uiState.setCommentsOpen,
    t,
  });
  return { createEditorGroup };
}

function useStoryEditorGraphActionModel({
  persistence,
  uiState,
  canvasState,
  selection,
  reviewOnly,
  t,
}: StoryEditorActionModelInput) {
  const addGraphDecoration = useStoryEditorDecorationAction({
    canvasRef: canvasState.canvasRef,
    flowInstanceRef: canvasState.flowInstanceRef,
    createGraphDecoration: persistence.createGraphDecoration,
    selectExclusive: selection.selectExclusive,
  });
  const graphDeletion = useStoryEditorGraphDeletion({
    story: persistence.story,
    t,
    setCanvasContextMenu: uiState.setCanvasContextMenu,
    deleteInteraction: persistence.deleteInteraction,
    deleteTrigger: persistence.deleteTrigger,
    deleteGraphDecoration: persistence.deleteGraphDecoration,
    closeInspector: selection.closeInspector,
    selected: selection.selected,
  });
  useStoryEditorDeleteShortcut({
    deleteGraphElement: graphDeletion.deleteGraphElement,
    reviewOnly,
    selected: selection.selected,
    selectedTriggerTarget: selection.selectedTriggerTarget,
    selectedGraphDecoration: selection.selectedGraphDecoration,
  });
  return { addGraphDecoration, graphDeletion };
}

function useStoryEditorEntityActionModel({
  persistence,
  canvasState,
  selection,
  contextNavigation,
}: StoryEditorActionModelInput) {
  const entityActions = useStoryEditorEntityActions({
    story: persistence.story,
    selectedCharacter: selection.selectedCharacter,
    setStory: persistence.setStory,
    selectExclusive: selection.selectExclusive,
    openContextPanel: contextNavigation.openContextPanel,
    openContextSection: contextNavigation.openContextSection,
    createLocation: persistence.createLocation,
    createCharacter: persistence.createCharacter,
    createStatDefinition: persistence.createStatDefinition,
    createItemDefinition: persistence.createItemDefinition,
  });
  const selectedLayoutTargets = getStoryGraphLayoutTargets(
    selection.graphSelection,
    selection.selected,
    selection.selectedTriggerTarget,
  );
  const organizeGraph = useStoryGraphOrganization({
    story: persistence.story,
    nodes: canvasState.nodes,
    selectedLayoutTargets,
    organizingRef: canvasState.organizingRef,
    setIsOrganizing: canvasState.setIsOrganizing,
    setFailedOrganizationScope: canvasState.setFailedOrganizationScope,
    getFlowInstance: () => canvasState.flowInstanceRef.current,
    setElkEdgeRoutes: canvasState.setElkEdgeRoutes,
    beginLocalEdit: persistence.beginLocalEdit,
    endLocalEdit: persistence.endLocalEdit,
    saveGraphPositions: persistence.saveGraphPositions,
  });
  return { entityActions, selectedLayoutTargets, organizeGraph };
}
