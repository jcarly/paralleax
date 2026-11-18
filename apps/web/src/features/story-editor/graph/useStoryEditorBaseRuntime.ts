import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import {
  useEdgesState,
  useNodesState,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import type { Story } from '@paralleax/shared';
import { useStoryEditorPersistence } from '../../../hooks/useStoryEditorPersistence';
import { usePendingSaveGuard } from '../../../hooks/usePendingSaveGuard';
import type { StoryFlowNode, TriggerFlowEdge } from '../../../storyGraph';
import type { TriggerEdgeRoutes } from '../../../triggerEdgeRouting';
import type { StorySettingsTab } from '../../story-settings/StorySettingsDialog';
import type { CanvasContextMenuState } from './storyEditorPointerActions';
import { useTwoFingerCanvasPan } from './useTwoFingerCanvasPan';

export function useStoryEditorPersistenceModel(
  storyId: string,
  setConnectionConflict: Dispatch<SetStateAction<boolean>>,
) {
  const persistence = useStoryEditorPersistence(storyId, setConnectionConflict);
  const pendingSaveGuard = usePendingSaveGuard(
    Boolean(persistence.story) &&
      (persistence.saveStatus === 'saving' || persistence.saveStatus === 'error'),
    'editor',
  );
  return { ...persistence, pendingSaveGuard };
}

export function useStoryEditorLocalUiState(searchParams: URLSearchParams) {
  const [editingGroupId, setEditingGroupId] = useState<string>();
  const creatingGroupRef = useRef(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [contextualCommentsTargetKey, setContextualCommentsTargetKey] = useState<string>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const storySettingsRouteTab: StorySettingsTab | undefined =
    searchParams.get('settings') === 'access' ? 'access' : undefined;
  const [storySettingsTab, setStorySettingsTab] = useState<StorySettingsTab>();
  const openStorySettingsTab = storySettingsRouteTab ?? storySettingsTab;
  const [placingComment, setPlacingComment] = useState(false);
  const [canvasContextMenu, setCanvasContextMenu] = useState<CanvasContextMenuState>();
  return {
    editingGroupId,
    setEditingGroupId,
    creatingGroupRef,
    commentsOpen,
    setCommentsOpen,
    contextualCommentsTargetKey,
    setContextualCommentsTargetKey,
    historyOpen,
    setHistoryOpen,
    storySettingsRouteTab,
    storySettingsTab,
    setStorySettingsTab,
    openStorySettingsTab,
    placingComment,
    setPlacingComment,
    canvasContextMenu,
    setCanvasContextMenu,
  };
}

export function useStoryEditorCanvasState(story?: Story) {
  const [nodes, setNodes, onNodesChange] = useNodesState<StoryFlowNode>([]);
  const [edges, setEdges] = useEdgesState<TriggerFlowEdge>([]);
  const [elkEdgeRoutes, setElkEdgeRoutes] = useState<TriggerEdgeRoutes>(() => new Map());
  const [isOrganizing, setIsOrganizing] = useState(false);
  const organizingRef = useRef(false);
  const [failedOrganizationScope, setFailedOrganizationScope] = useState<'all' | 'selection'>();
  const [interactionSizes, setInteractionSizes] = useState<
    ReadonlyMap<string, { width: number; height: number }>
  >(() => new Map());
  const interactionIds = useMemo(
    () => new Set(story?.interactions.map(({ id }) => id) ?? []),
    [story?.interactions],
  );
  const handleNodesChange = useCallback(
    (changes: NodeChange<StoryFlowNode>[]) => {
      onNodesChange(changes);
      setInteractionSizes((current) =>
        applyInteractionSizeChanges(current, changes, interactionIds),
      );
    },
    [interactionIds, onNodesChange],
  );
  const flowInstanceRef = useRef<ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null>(null);
  const [pendingFocusInteractionId, setPendingFocusInteractionId] = useState<string>();
  const appliedInitialFocusInteractionIdRef = useRef<string | undefined>(undefined);
  const canvasRef = useRef<HTMLElement | null>(null);
  useTwoFingerCanvasPan(canvasRef, story?.id);
  return {
    nodes,
    setNodes,
    handleNodesChange,
    edges,
    setEdges,
    elkEdgeRoutes,
    setElkEdgeRoutes,
    isOrganizing,
    setIsOrganizing,
    organizingRef,
    failedOrganizationScope,
    setFailedOrganizationScope,
    interactionSizes,
    flowInstanceRef,
    pendingFocusInteractionId,
    setPendingFocusInteractionId,
    appliedInitialFocusInteractionIdRef,
    canvasRef,
  };
}

export function useStoryEditorBaseRuntime() {
  const { t } = useTranslation();
  const { storyId = '' } = useParams();
  const routeLocation = useLocation();
  const [connectionConflict, setConnectionConflict] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const persistence = useStoryEditorPersistenceModel(storyId, setConnectionConflict);
  const storySettingsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const uiState = useStoryEditorLocalUiState(searchParams);
  const canvasState = useStoryEditorCanvasState(persistence.story);
  return {
    t,
    storyId,
    routeLocation,
    connectionConflict,
    setConnectionConflict,
    searchParams,
    setSearchParams,
    persistence,
    storySettingsTriggerRef,
    uiState,
    canvasState,
  };
}

function applyInteractionSizeChanges(
  current: ReadonlyMap<string, { width: number; height: number }>,
  changes: NodeChange<StoryFlowNode>[],
  interactionIds: ReadonlySet<string>,
) {
  let next: Map<string, { width: number; height: number }> | undefined;
  for (const change of changes) {
    if (!isTrackedDimensionChange(change, interactionIds)) {
      continue;
    }
    const previous = (next ?? current).get(change.id);
    if (sameInteractionSize(previous, change.dimensions)) {
      continue;
    }
    next ??= new Map(current);
    next.set(change.id, change.dimensions);
  }
  return next ?? current;
}

type DimensionsChange = Extract<NodeChange<StoryFlowNode>, { type: 'dimensions' }> & {
  dimensions: { width: number; height: number };
};

function isTrackedDimensionChange(
  change: NodeChange<StoryFlowNode>,
  interactionIds: ReadonlySet<string>,
): change is DimensionsChange {
  return (
    change.type === 'dimensions' && change.dimensions !== undefined && interactionIds.has(change.id)
  );
}

function sameInteractionSize(
  previous: { width: number; height: number } | undefined,
  next: { width: number; height: number },
) {
  return previous?.width === next.width && previous.height === next.height;
}
