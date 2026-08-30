import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Background,
  Controls,
  ReactFlow,
  SelectionMode,
  useEdgesState,
  useNodesState,
  type NodeChange,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from '@xyflow/react';
import { Link, Navigate, useParams } from 'react-router-dom';
import {
  canManageCommentThread as canActorManageCommentThread,
  isCommentAnchorDetached,
  type Character,
  type CommentAnchor,
  type CommentTargetType,
  type GraphDecoration,
  type Interaction,
  type ItemDefinition,
  type Location,
  type Position,
  type StatDefinition,
  type StoryCommentThread,
  type Trigger,
} from '@paralleax/shared';
import { CharacterInspector } from '../components/CharacterInspector';
import { InteractionInspector } from '../components/InteractionInspector';
import { InteractionNode } from '../components/InteractionNode';
import { ItemDefinitionInspector } from '../components/ItemDefinitionInspector';
import { LocationInspector } from '../components/LocationInspector';
import { StatDefinitionInspector } from '../components/StatDefinitionInspector';
import { StoryCanvasContextMenu } from '../components/StoryCanvasContextMenu';
import { StoryCanvasToolbar } from '../components/StoryCanvasToolbar';
import { CategorizedContextList, ContextThumbnail } from '../components/StoryContextList';
import { StoryGraphSelectionInspector } from '../components/StoryGraphSelectionInspector';
import { TriggerEdge } from '../components/TriggerEdge';
import { TriggerInspector } from '../components/TriggerInspector';
import { TriggerNode } from '../components/TriggerNode';
import { RichTextContent } from '../components/RichTextContent';
import { CommentPinNode, type CommentPinFlowNode } from '../features/comments/CommentPinNode';
import { ContextualCommentsRail } from '../features/comments/ContextualCommentsRail';
import { StoryCommentsPanel } from '../features/comments/StoryCommentsPanel';
import { captureActiveTextSelection } from '../features/comments/textAnchors';
import { useStoryComments } from '../features/comments/useStoryComments';
import { GraphDecorationInspector } from '../features/graph-decorations/GraphDecorationInspector';
import { GraphDecorationNode } from '../features/graph-decorations/GraphDecorationNode';
import { buildGraphDecorationNodes } from '../features/graph-decorations/graphDecorationNodes';
import { isRealtimeEditableTarget } from '../features/realtime/storyRealtime';
import { useStoryConnectionController } from '../features/story-editor/graph/useStoryConnectionController';
import { useStoryContextNavigation } from '../features/story-editor/navigation/useStoryContextNavigation';
import { useStoryEditorSelection } from '../features/story-editor/selection/useStoryEditorSelection';
import { useStoryEditorPersistence } from '../hooks/useStoryEditorPersistence';
import { usePendingSaveGuard } from '../hooks/usePendingSaveGuard';
import {
  applyInteractionMovesEdgePreview,
  applyInteractionMovesTriggerPreview,
  buildInteractionNodes,
  buildTriggerNodes,
  buildTriggerEdges,
  getInteractionMovesTriggerPositionUpdates,
  type SelectedTrigger,
  type StoryFlowNode,
  type TriggerFlowEdge,
} from '../storyGraph';
import {
  computeStoryGraphLayout,
  type StoryGraphLayoutScope,
  type StoryGraphLayoutTarget,
} from '../storyGraphLayout';
import { applyStoryGraphSelection, getStoryGraphSelectionTargets } from '../storyGraphSelection';
import {
  getStoryGraphClickCreationPosition,
  type StoryGraphClickCreation,
} from '../storyGraphCreationLayout';
import { getReferencedInteractionIds } from '../storyNavigation';

const nodeTypes = {
  interaction: InteractionNode,
  trigger: TriggerNode,
  graphDecoration: GraphDecorationNode,
  commentPin: CommentPinNode,
};
const edgeTypes = { trigger: TriggerEdge };
const fitViewOptions = { padding: 0.18, maxZoom: 1 };
const canvasPanMouseButtons = [1];

interface CanvasContextMenuState {
  screenPosition: Position;
  flowPosition: Position;
}

function getInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLocaleUpperCase();
}

export function StoryEditor({ currentUserId }: { currentUserId?: string }) {
  const { t } = useTranslation();
  const { storyId = '' } = useParams();
  const {
    story,
    setStory,
    error,
    saveStatus,
    realtimeStatus,
    beginLocalEdit,
    endLocalEdit,
    retry,
    renameStory,
    updateStoryStartDateTime,
    saveTrigger,
    saveGraphPositions,
    createTriggerVariant,
    deleteTrigger,
    deleteTriggerVariants,
    deleteTriggerInput,
    connectInteractions,
    connectToExistingTrigger,
    createRoot,
    createChildFromInteraction,
    createParentForInteraction,
    patchInteraction,
    deleteInteraction,
    createGraphDecoration,
    updateGraphDecoration,
    deleteGraphDecoration,
    createLocation,
    updateLocation,
    createCharacter,
    updateCharacter,
    createStatDefinition,
    updateStatDefinition,
    createItemDefinition,
    updateItemDefinition,
    createCharacterStat,
    updateCharacterStat,
    deleteCharacterStat,
    createCharacterItem,
    deleteCharacterItem,
    moveItemInstance,
    history,
    historyBusy,
    undo,
    redo,
  } = useStoryEditorPersistence(storyId);
  usePendingSaveGuard(Boolean(story) && (saveStatus === 'saving' || saveStatus === 'error'));
  const formatCount = useCallback(
    (
      count: number,
      entity:
        'location' | 'character' | 'stat' | 'item' | 'interaction' | 'assignment' | 'instance',
    ) => t(`editor.count.${entity}`, { count }),
    [t],
  );
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [placingComment, setPlacingComment] = useState(false);
  const [canvasContextMenu, setCanvasContextMenu] = useState<CanvasContextMenuState>();
  const [nodes, setNodes, onNodesChange] = useNodesState<StoryFlowNode>([]);
  const [edges, setEdges] = useEdgesState<TriggerFlowEdge>([]);
  const [interactionSizes, setInteractionSizes] = useState<
    ReadonlyMap<string, { width: number; height: number }>
  >(() => new Map());
  const handleNodesChange = useCallback(
    (changes: NodeChange<StoryFlowNode>[]) => {
      onNodesChange(changes);
      const interactionIds = new Set(story?.interactions.map(({ id }) => id) ?? []);
      setInteractionSizes((current) =>
        applyInteractionSizeChanges(current, changes, interactionIds),
      );
    },
    [onNodesChange, story?.interactions],
  );
  const flowInstance = useRef<ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null>(null);
  const canvasRef = useRef<HTMLElement | null>(null);
  const {
    selectedId,
    selectedTrigger,
    selectedGraphDecorationId,
    selectedLocationId,
    selectedCharacterId,
    selectedStatDefinitionId,
    selectedItemDefinitionId,
    isCreatingStatDefinition,
    graphSelection,
    selected,
    selectedTriggerTarget,
    selectedGraphDecoration,
    selectedLocation,
    selectedCharacter,
    selectedStatDefinition,
    selectedItemDefinition,
    selectedGraphNodeIds,
    selectedContextReference,
    selectedCommentTarget,
    hasInspectorSelection,
    selectExclusive,
    selectInteraction,
    focusInteraction,
    clearSelection: closeInspector,
    handleGraphSelectionStart,
    handleGraphSelectionChange,
    handleGraphSelectionEnd,
  } = useStoryEditorSelection(story);
  const {
    searchQuery,
    setSearchQuery,
    clearSearch,
    isContextPanelOpen: isLocationPanelOpen,
    toggleContextPanel,
    openContextPanel,
    openContextSections,
    toggleContextSection,
    openContextSection,
    occurrenceCounts,
    navigationInteractionIds,
    currentNavigationIndex,
    emphasizedInteractionIds,
    filteredLocations,
    filteredCharacters,
    filteredStatDefinitions,
    filteredItemDefinitions,
    locationCategories,
    characterCategories,
    statCategories,
    itemCategories,
    contextReferenceCounts,
    navigateInteractions,
  } = useStoryContextNavigation({
    story,
    selectedId,
    selectedContextReference,
    flowInstanceRef: flowInstance,
    selectInteraction,
    focusInteraction,
  });
  const connectionController = useStoryConnectionController({
    story,
    flowInstanceRef: flowInstance,
    connectInteractions,
    connectToExistingTrigger,
    createChildFromInteraction,
    createParentForInteraction,
  });
  const {
    isConnecting,
    pending,
    existingTriggerChoices,
    requestConnection,
    startCanvasConnection,
    endCanvasConnection,
    createPendingTrigger,
    extendPendingTrigger,
    cancelPendingConnection,
  } = connectionController;

  const commentAccess = story?.capabilities?.canEdit === true;
  const reviewOnly = story?.capabilities?.canEdit === false;
  const comments = useStoryComments(storyId, commentAccess);
  const commentThreads = comments.threads;
  const selectCommentThread = comments.selectThread;
  const projectedCommentThreads = useMemo(
    () =>
      story
        ? commentThreads.map((thread) => ({
            ...thread,
            detached: isCommentAnchorDetached(story, thread.anchor),
          }))
        : commentThreads,
    [commentThreads, story],
  );
  const selectedTargetThreads = selectedCommentTarget
    ? projectedCommentThreads.filter(
        (thread) =>
          thread.anchor.kind !== 'canvas' &&
          thread.anchor.targetType === selectedCommentTarget.targetType &&
          thread.anchor.targetId === selectedCommentTarget.targetId,
      )
    : [];
  const contextualDraftAnchor: Exclude<CommentAnchor, { kind: 'canvas' }> | undefined = (() => {
    const anchor = comments.draftAnchor;
    const target = selectedCommentTarget;
    if (!anchor || anchor.kind === 'canvas' || !target) return undefined;
    return anchor.targetType === target.targetType && anchor.targetId === target.targetId
      ? anchor
      : undefined;
  })();
  const canManageCommentThread = useCallback(
    (thread: StoryCommentThread) =>
      canActorManageCommentThread(story?.capabilities, currentUserId, thread),
    [currentUserId, story?.capabilities],
  );
  const openCommentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const thread of projectedCommentThreads) {
      if (thread.status !== 'open' || thread.anchor.kind === 'canvas') continue;
      counts.set(thread.anchor.targetId, (counts.get(thread.anchor.targetId) ?? 0) + 1);
    }
    return counts;
  }, [projectedCommentThreads]);
  const showContextualComments = Boolean(
    !commentsOpen &&
    selectedCommentTarget &&
    (selectedTargetThreads.length > 0 || contextualDraftAnchor),
  );
  const hasInspector = commentsOpen || hasInspectorSelection;

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (isRealtimeEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      const action =
        key === 'y' || (key === 'z' && event.shiftKey) ? 'redo' : key === 'z' ? 'undo' : undefined;
      if (!action || saveStatus === 'saving' || saveStatus === 'error' || historyBusy) return;
      if (action === 'undo' ? !history.canUndo : !history.canRedo) return;
      event.preventDefault();
      void (action === 'undo' ? undo() : redo());
    };
    document.addEventListener('keydown', handleHistoryShortcut);
    return () => document.removeEventListener('keydown', handleHistoryShortcut);
  }, [history.canRedo, history.canUndo, historyBusy, redo, saveStatus, undo]);

  const focusCommentThread = useCallback(
    (threadId: string) => {
      const thread = projectedCommentThreads.find(({ id }) => id === threadId);
      if (!thread) return;

      selectCommentThread(thread.id);
      setCommentsOpen(false);

      const graphNodeIds: string[] = [];
      if (thread.anchor.kind === 'canvas') {
        closeInspector();
        graphNodeIds.push(`comment:${thread.id}`);
      } else if (thread.anchor.targetType === 'interaction') {
        selectExclusive({ type: 'interaction', id: thread.anchor.targetId });
        graphNodeIds.push(thread.anchor.targetId);
      } else if (thread.anchor.targetType === 'trigger') {
        const triggerId = thread.anchor.targetId;
        const owner = story?.interactions.find((interaction) =>
          interaction.triggers.some(({ id }) => id === triggerId),
        );
        if (owner) {
          selectExclusive({
            type: 'trigger',
            trigger: { interactionId: owner.id, triggerId },
          });
          graphNodeIds.push(owner.id);
        } else closeInspector();
      } else if (thread.anchor.targetType === 'location') {
        selectExclusive({ type: 'location', id: thread.anchor.targetId });
        graphNodeIds.push(
          ...getReferencedInteractionIds(story, {
            type: 'location',
            id: thread.anchor.targetId,
          }),
        );
      } else if (thread.anchor.targetType === 'character') {
        selectExclusive({ type: 'character', id: thread.anchor.targetId });
        graphNodeIds.push(
          ...getReferencedInteractionIds(story, {
            type: 'character',
            id: thread.anchor.targetId,
          }),
        );
      } else if (thread.anchor.targetType === 'statDefinition') {
        selectExclusive({ type: 'statDefinition', id: thread.anchor.targetId });
        graphNodeIds.push(
          ...getReferencedInteractionIds(story, {
            type: 'stat',
            id: thread.anchor.targetId,
          }),
        );
      } else {
        selectExclusive({ type: 'itemDefinition', id: thread.anchor.targetId });
        graphNodeIds.push(
          ...getReferencedInteractionIds(story, {
            type: 'item',
            id: thread.anchor.targetId,
          }),
        );
      }

      if (graphNodeIds.length > 0) {
        window.requestAnimationFrame(() => {
          void flowInstance.current?.fitView({
            nodes: graphNodeIds.map((id) => ({ id })),
            duration: 250,
            padding: 0.7,
            maxZoom: 1,
          });
        });
      }
    },
    [closeInspector, projectedCommentThreads, selectCommentThread, selectExclusive, story],
  );

  const openCommentsForTarget = useCallback(
    (targetType: CommentTargetType, targetId: string) => {
      const thread = projectedCommentThreads.find(
        (candidate) =>
          candidate.status === 'open' &&
          candidate.anchor.kind !== 'canvas' &&
          candidate.anchor.targetType === targetType &&
          candidate.anchor.targetId === targetId,
      );
      if (!thread) return;
      selectCommentThread(thread.id);
      setCommentsOpen(false);
      if (targetType === 'interaction') {
        selectExclusive({ type: 'interaction', id: targetId });
        return;
      }
      const owner = story?.interactions.find((interaction) =>
        interaction.triggers.some(({ id }) => id === targetId),
      );
      if (owner) {
        selectExclusive({
          type: 'trigger',
          trigger: { interactionId: owner.id, triggerId: targetId },
        });
      } else closeInspector();
    },
    [
      closeInspector,
      projectedCommentThreads,
      selectCommentThread,
      selectExclusive,
      story?.interactions,
    ],
  );

  const getClickCreationPosition = useCallback(
    (creation: StoryGraphClickCreation) =>
      story ? getStoryGraphClickCreationPosition(story, creation, { interactionSizes }) : undefined,
    [interactionSizes, story],
  );
  const createRootFromClick = useCallback(
    () => createRoot(getClickCreationPosition({ kind: 'root' })),
    [createRoot, getClickCreationPosition],
  );
  const createChildFromClick = useCallback(
    (sourceId: string) =>
      createChildFromInteraction(sourceId, getClickCreationPosition({ kind: 'child', sourceId })),
    [createChildFromInteraction, getClickCreationPosition],
  );
  const createParentFromClick = useCallback(
    (targetId: string) =>
      createParentForInteraction(targetId, getClickCreationPosition({ kind: 'parent', targetId })),
    [createParentForInteraction, getClickCreationPosition],
  );

  const storyNodes = useMemo(
    () =>
      buildInteractionNodes(story, selectedId, selectedTrigger, {
        showNewTriggerInput: !reviewOnly && isConnecting,
        onCreateChild: reviewOnly
          ? undefined
          : (interactionId) => void createChildFromClick(interactionId),
        onCreateParent: reviewOnly
          ? undefined
          : (interactionId) => void createParentFromClick(interactionId),
        onSelectRootTrigger: (interactionId, triggerId) =>
          selectExclusive({ type: 'trigger', trigger: { interactionId, triggerId } }),
        occurrenceCounts,
        emphasizedInteractionIds,
        commentCounts: openCommentCounts,
        onOpenComments: openCommentsForTarget,
      }),
    [
      createChildFromClick,
      createParentFromClick,
      isConnecting,
      occurrenceCounts,
      emphasizedInteractionIds,
      openCommentCounts,
      openCommentsForTarget,
      reviewOnly,
      selectExclusive,
      selectedId,
      selectedTrigger,
      story,
    ],
  );
  const decorationNodes = useMemo(
    () =>
      buildGraphDecorationNodes(
        story,
        selectedGraphDecorationId,
        !reviewOnly,
        (decorationId, patch) => void updateGraphDecoration(decorationId, patch),
      ),
    [reviewOnly, selectedGraphDecorationId, story, updateGraphDecoration],
  );
  const triggerNodes = useMemo(
    () =>
      buildTriggerNodes(story, selectedTrigger, {
        onSelectTrigger: (interactionId, triggerId) =>
          selectExclusive({ type: 'trigger', trigger: { interactionId, triggerId } }),
        commentCounts: openCommentCounts,
        onOpenComments: openCommentsForTarget,
      }),
    [openCommentCounts, openCommentsForTarget, selectExclusive, story, selectedTrigger],
  );
  const narrativeNodes = useMemo(
    () => applyStoryGraphSelection([...storyNodes, ...triggerNodes], graphSelection),
    [graphSelection, storyNodes, triggerNodes],
  );

  const commentNodes = useMemo<CommentPinFlowNode[]>(
    () => [
      ...projectedCommentThreads.flatMap((thread) =>
        thread.anchor.kind === 'canvas'
          ? [
              {
                id: `comment:${thread.id}`,
                type: 'commentPin' as const,
                position: thread.anchor.position,
                draggable: false,
                selectable: false,
                zIndex: 1_000,
                data: {
                  thread,
                  expanded: thread.id === comments.selectedThreadId,
                  canComment: story?.capabilities?.canComment === true,
                  canManageThread: canManageCommentThread(thread),
                  onOpen: (threadId: string) => {
                    selectCommentThread(threadId);
                    setCommentsOpen(false);
                  },
                  onCreate: comments.create,
                  onCancelDraft: comments.cancelDraft,
                  onReply: comments.reply,
                  onStatus: comments.setStatus,
                },
              },
            ]
          : [],
      ),
      ...(comments.draftAnchor?.kind === 'canvas'
        ? [
            {
              id: 'comment:draft',
              type: 'commentPin' as const,
              position: comments.draftAnchor.position,
              draggable: false,
              selectable: false,
              zIndex: 1_001,
              data: {
                draftAnchor: comments.draftAnchor,
                expanded: true,
                canComment: story?.capabilities?.canComment === true,
                canManageThread: false,
                onOpen: selectCommentThread,
                onCreate: comments.create,
                onCancelDraft: comments.cancelDraft,
                onReply: comments.reply,
                onStatus: comments.setStatus,
              },
            },
          ]
        : []),
    ],
    [
      canManageCommentThread,
      comments.cancelDraft,
      comments.create,
      comments.draftAnchor,
      comments.reply,
      comments.selectedThreadId,
      comments.setStatus,
      projectedCommentThreads,
      selectCommentThread,
      story?.capabilities?.canComment,
    ],
  );

  useEffect(() => {
    setNodes([
      ...decorationNodes,
      ...narrativeNodes.map((node) => (reviewOnly ? { ...node, draggable: false } : node)),
      ...commentNodes,
    ]);
  }, [commentNodes, decorationNodes, narrativeNodes, reviewOnly, setNodes]);

  const selectTriggerData = useCallback(
    (trigger: SelectedTrigger) => {
      selectCommentThread(undefined);
      selectExclusive({ type: 'trigger', trigger });
    },
    [selectCommentThread, selectExclusive],
  );
  const deleteSelectedTriggerInput = useCallback(
    async (interactionId: string, triggerId: string, inputInteractionId: string) => {
      await deleteTriggerInput(interactionId, triggerId, inputInteractionId);
      closeInspector();
    },
    [closeInspector, deleteTriggerInput],
  );
  const storyEdges = useMemo(
    () =>
      buildTriggerEdges(story, selectTriggerData, (interactionId, triggerId, inputId) => {
        void deleteSelectedTriggerInput(interactionId, triggerId, inputId);
      }),
    [deleteSelectedTriggerInput, selectTriggerData, story],
  );

  useEffect(() => {
    setEdges(storyEdges);
  }, [setEdges, storyEdges]);

  function previewInteractionMoves(
    movedNodes: readonly StoryFlowNode[],
    interactionPositionOverrides: ReadonlyMap<string, Position>,
  ) {
    const directlyMovedTriggerNodeIds = new Set(
      movedNodes.flatMap((node) => (node.type === 'trigger' ? [node.id] : [])),
    );
    setNodes((current) =>
      applyInteractionMovesTriggerPreview(
        current,
        story,
        interactionPositionOverrides,
        directlyMovedTriggerNodeIds,
      ),
    );
    setEdges((current) =>
      applyInteractionMovesEdgePreview(current, story, interactionPositionOverrides),
    );
  }

  function getMovedNarrativeNodes(
    draggedNode: StoryFlowNode,
    draggedNodes: readonly StoryFlowNode[],
  ): StoryFlowNode[] {
    if (!graphSelection || !selectedGraphNodeIds.has(draggedNode.id)) return [draggedNode];
    const selectedDraggedNodes = draggedNodes.filter(
      (node) =>
        selectedGraphNodeIds.has(node.id) &&
        (node.type === 'interaction' || node.type === 'trigger'),
    );
    return selectedDraggedNodes.length > 0 ? selectedDraggedNodes : [draggedNode];
  }

  function getInteractionPositionOverrides(movedNodes: readonly StoryFlowNode[]) {
    return new Map(
      movedNodes.flatMap((node) =>
        node.type === 'interaction' ? [[node.id, node.position] as const] : [],
      ),
    );
  }

  function handleNodeDragStart(_: MouseEvent | TouchEvent, node: StoryFlowNode) {
    if (graphSelection && !selectedGraphNodeIds.has(node.id)) closeInspector();
    beginLocalEdit();
  }

  function handleNodeDrag(
    _: MouseEvent | TouchEvent,
    node: StoryFlowNode,
    draggedNodes: StoryFlowNode[],
  ) {
    const movedNodes = getMovedNarrativeNodes(node, draggedNodes);
    previewInteractionMoves(movedNodes, getInteractionPositionOverrides(movedNodes));
  }

  async function persistNodeDrag(node: StoryFlowNode, draggedNodes: StoryFlowNode[]) {
    const movedNodes = getMovedNarrativeNodes(node, draggedNodes);
    const interactionPositionOverrides = getInteractionPositionOverrides(movedNodes);
    const directlyMovedTriggers = movedNodes.flatMap((movedNode) =>
      movedNode.type === 'trigger' ? [movedNode] : [],
    );
    const directlyMovedTriggerIds = new Set(
      directlyMovedTriggers.flatMap((triggerNode) => triggerNode.data.triggerIds),
    );
    const elasticTriggerUpdates = getInteractionMovesTriggerPositionUpdates(
      story,
      interactionPositionOverrides,
    ).filter((update) =>
      update.triggerIds.every((triggerId) => !directlyMovedTriggerIds.has(triggerId)),
    );

    previewInteractionMoves(movedNodes, interactionPositionOverrides);
    const interactionUpdates = Array.from(interactionPositionOverrides.entries()).map(
      ([interactionId, position]) => ({ interactionId, position }),
    );
    const triggerUpdates = [
      ...directlyMovedTriggers.map((triggerNode) => ({
        interactionId: triggerNode.data.interactionId,
        triggerIds: triggerNode.data.triggerIds,
        position: triggerNode.position,
      })),
      ...elasticTriggerUpdates,
    ];

    try {
      await saveGraphPositions({ interactionUpdates, triggerUpdates });
    } finally {
      endLocalEdit();
    }
  }

  const select: NodeMouseHandler = (_, node) => {
    setCanvasContextMenu(undefined);
    if (node.type === 'commentPin') return;

    selectCommentThread(undefined);
    if (selectedGraphNodeIds.has(node.id)) return;

    if (node.type === 'graphDecoration') {
      if (reviewOnly) return;
      selectExclusive({ type: 'graphDecoration', id: node.id });
      return;
    }

    if (node.type !== 'interaction') return;

    selectExclusive({ type: 'interaction', id: node.id });
  };

  async function addGraphDecoration(kind: GraphDecoration['kind'], anchorPosition?: Position) {
    const bounds = canvasRef.current?.getBoundingClientRect();
    const center =
      anchorPosition ??
      flowInstance.current?.screenToFlowPosition({
        x: bounds ? bounds.left + bounds.width / 2 : window.innerWidth / 2,
        y: bounds ? bounds.top + bounds.height / 2 : window.innerHeight / 2,
      });
    const position = center
      ? kind === 'frame'
        ? { x: center.x - 210, y: center.y - 120 }
        : center
      : { x: 80, y: 80 };
    const decorationId = await createGraphDecoration(kind, position);
    if (!decorationId) return;
    selectExclusive({ type: 'graphDecoration', id: decorationId });
  }

  function startEntityComment() {
    if (!selectedCommentTarget || !story?.capabilities?.canComment) return;
    comments.startThread({ kind: 'entity', ...selectedCommentTarget });
    comments.selectThread(undefined);
    setCommentsOpen(false);
  }

  function startTextComment() {
    if (!selectedCommentTarget || !story?.capabilities?.canComment) return;
    const selection = captureActiveTextSelection();
    if (!selection) return;
    comments.startThread({
      kind: 'text',
      ...selectedCommentTarget,
      field: selection.field,
      selector: selection.selector,
    });
    comments.selectThread(undefined);
    setCommentsOpen(false);
  }

  async function reattachSelectedThread(threadId: string) {
    if (!selectedCommentTarget) return;
    const selection = captureActiveTextSelection();
    await comments.reanchor(
      threadId,
      selection
        ? {
            kind: 'text',
            ...selectedCommentTarget,
            field: selection.field,
            selector: selection.selector,
          }
        : { kind: 'entity', ...selectedCommentTarget },
    );
  }

  function handlePaneClick(event: ReactMouseEvent) {
    setCanvasContextMenu(undefined);
    selectCommentThread(undefined);
    if (placingComment && story?.capabilities?.canComment) {
      const position = flowInstance.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      if (position) startCanvasComment(position);
      setPlacingComment(false);
      return;
    }
    closeInspector();
  }

  function handlePaneContextMenu(event: MouseEvent | ReactMouseEvent) {
    event.preventDefault();
    if (reviewOnly && story?.capabilities?.canComment !== true) return;
    const position = flowInstance.current?.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    if (!position) return;
    setPlacingComment(false);
    selectCommentThread(undefined);
    setCanvasContextMenu({
      screenPosition: { x: event.clientX, y: event.clientY },
      flowPosition: position,
    });
  }

  function startCanvasComment(position: Position) {
    if (story?.capabilities?.canComment !== true) return;
    comments.startThread({ kind: 'canvas', position });
    comments.selectThread(undefined);
    setCommentsOpen(false);
  }

  function toggleCommentsList() {
    if (!commentsOpen) {
      comments.cancelDraft();
      comments.selectThread(undefined);
    }
    setCommentsOpen((open) => !open);
  }

  async function deleteSelectedTrigger(interactionId: string, triggerId: string) {
    if (!window.confirm(t('editor.confirmDeleteTrigger'))) return;
    await deleteTrigger(interactionId, triggerId);
    closeInspector();
  }

  async function deleteSelectedTriggerGroup(
    interactionId: string,
    triggerId: string,
    nextTriggerId: string,
  ) {
    selectExclusive({
      type: 'trigger',
      trigger: { interactionId, triggerId: nextTriggerId },
    });
    await deleteTrigger(interactionId, triggerId);
  }

  async function createSelectedTriggerVariant(interactionId: string, triggerId: string) {
    const createdTriggerId = await createTriggerVariant(interactionId, triggerId);
    if (createdTriggerId) {
      selectExclusive({
        type: 'trigger',
        trigger: { interactionId, triggerId: createdTriggerId },
      });
    }
  }

  async function deleteSelectedTriggerVariants(interactionId: string, triggerIds: string[]) {
    if (!window.confirm(t('editor.confirmDeleteTriggerVariants'))) return;
    await deleteTriggerVariants(interactionId, triggerIds);
    closeInspector();
  }

  async function remove() {
    if (!selected) return;
    if (!window.confirm(`Delete “${selected.title}” and its trigger links?`)) return;
    await deleteInteraction(selected.id);
    closeInspector();
  }

  async function addLocation() {
    const locationId = await createLocation();
    if (!locationId) return;
    selectExclusive({ type: 'location', id: locationId });
    openContextPanel();
  }

  function updateLocalLocation(nextLocation: NonNullable<typeof selectedLocation>) {
    if (!story) return;
    setStory({
      ...story,
      locations: (story.locations ?? []).map((location) =>
        location.id === nextLocation.id ? nextLocation : location,
      ),
    });
  }

  async function addCharacter() {
    const characterId = await createCharacter();
    if (!characterId) return;
    selectExclusive({ type: 'character', id: characterId });
    openContextPanel();
  }

  function addStatDefinition() {
    selectExclusive({ type: 'statDefinitionCreation' });
    openContextPanel();
    openContextSection('stats');
  }

  function updateLocalStatDefinition(nextDefinition: NonNullable<typeof selectedStatDefinition>) {
    setStory({
      ...story!,
      statDefinitions: (story?.statDefinitions ?? []).map((definition) =>
        definition.id === nextDefinition.id ? nextDefinition : definition,
      ),
    });
  }

  async function addItemDefinition() {
    const itemDefinitionId = await createItemDefinition();
    if (!itemDefinitionId) return;
    selectExclusive({ type: 'itemDefinition', id: itemDefinitionId });
    openContextPanel();
    openContextSection('items');
  }

  function updateLocalItemDefinition(nextDefinition: NonNullable<typeof selectedItemDefinition>) {
    setStory({
      ...story!,
      itemDefinitions: (story?.itemDefinitions ?? []).map((definition) =>
        definition.id === nextDefinition.id ? nextDefinition : definition,
      ),
    });
  }

  function updateLocalCharacter(patch: Partial<NonNullable<typeof selectedCharacter>>) {
    if (!story || !selectedCharacter) return;
    setStory({
      ...story,
      characters: (story.characters ?? []).map((character) =>
        character.id === selectedCharacter.id ? { ...character, ...patch } : character,
      ),
    });
  }

  if (!story) return <main className="page">{error || t('editor.loading')}</main>;
  if (story.capabilities?.canEdit !== true) {
    return <Navigate to={`/stories/${storyId}/play`} replace />;
  }
  const simulationPath = selected
    ? `/stories/${storyId}/play?mode=simulation&startInteractionId=${encodeURIComponent(
        selected.id,
      )}`
    : `/stories/${storyId}/play?mode=simulation`;
  const selectedLayoutTargets: StoryGraphLayoutTarget[] = (() => {
    const graphSelectionTargets = getStoryGraphSelectionTargets(graphSelection);
    if (graphSelectionTargets.length > 0) return graphSelectionTargets;
    if (selected) return [{ type: 'interaction', interactionId: selected.id }];
    if (!selectedTriggerTarget) return [];
    return selectedTriggerTarget.trigger.inputInteractionIds.length === 0
      ? [
          {
            type: 'interaction',
            interactionId: selectedTriggerTarget.interaction.id,
          },
        ]
      : [
          {
            type: 'trigger',
            interactionId: selectedTriggerTarget.interaction.id,
            triggerId: selectedTriggerTarget.trigger.id,
          },
        ];
  })();
  async function organizeGraph(preference: 'auto' | 'all' | 'selection' = 'auto') {
    if (!story || story.interactions.length === 0) return;
    if (preference === 'selection' && selectedLayoutTargets.length === 0) return;
    const scope: StoryGraphLayoutScope =
      preference !== 'all' && selectedLayoutTargets.length > 0
        ? { kind: 'selection', targets: selectedLayoutTargets }
        : { kind: 'all' };
    const interactionSizes = getMeasuredInteractionSizes(nodes);
    const layout = computeStoryGraphLayout(story, scope, { interactionSizes });
    const hasPositionUpdates =
      layout.interactionUpdates.length > 0 || layout.triggerUpdates.length > 0;
    if (hasPositionUpdates) beginLocalEdit();
    window.requestAnimationFrame(() => {
      if (layout.affectedNodeIds.length === 0) return;
      void flowInstance.current?.fitView({
        nodes: layout.affectedNodeIds.map((id) => ({ id })),
        duration: 250,
        padding: scope.kind === 'all' ? 0.18 : 0.7,
        maxZoom: 1,
      });
    });
    try {
      await saveGraphPositions({
        interactionUpdates: layout.interactionUpdates,
        triggerUpdates: layout.triggerUpdates,
      });
    } finally {
      if (hasPositionUpdates) endLocalEdit();
    }
  }

  return (
    <main
      className="editor-page"
      onFocusCapture={(event) => {
        if (!reviewOnly && isRealtimeEditableTarget(event.target)) beginLocalEdit();
      }}
      onBlurCapture={(event) => {
        if (!reviewOnly && isRealtimeEditableTarget(event.target)) endLocalEdit();
      }}
    >
      <div className="editor-toolbar">
        <input
          className="story-title-input"
          value={story.title}
          readOnly={reviewOnly}
          onChange={(e) => {
            if (!reviewOnly) setStory({ ...story, title: e.target.value });
          }}
          onBlur={(e) => {
            if (!reviewOnly) void renameStory(e.target.value);
          }}
        />
        <label className="story-time-field">
          {t('editor.storyStarts')}
          <input
            aria-label={t('editor.storyStartDateTime')}
            type="datetime-local"
            value={story.startDateTime ?? '2000-01-03T08:00'}
            disabled={reviewOnly}
            onChange={(event) => setStory({ ...story, startDateTime: event.target.value })}
            onBlur={(event) => void updateStoryStartDateTime(event.target.value)}
          />
        </label>
        <div className="actions">
          {story.capabilities?.canManage ? (
            <Link className="button secondary" to={`/stories/${storyId}/access`}>
              {t('editor.access')}
            </Link>
          ) : null}
          {commentAccess ? (
            <button
              className={`secondary comments-toolbar-button ${commentsOpen ? 'active' : ''}`}
              type="button"
              onClick={toggleCommentsList}
            >
              {t('comments.title')}
              {comments.threads.filter(({ status }) => status === 'open').length ? (
                <small>{comments.threads.filter(({ status }) => status === 'open').length}</small>
              ) : null}
            </button>
          ) : null}
          {!reviewOnly ? (
            <span
              className={`story-realtime-status ${realtimeStatus}`}
              role="status"
              aria-live="polite"
            >
              <span aria-hidden="true" />
              {t(`editor.realtime.${realtimeStatus}`)}
            </span>
          ) : null}
          {!reviewOnly ? (
            <span
              className={`save-status ${saveStatus}`}
              role="status"
              aria-label={t('editor.saveStatus')}
              aria-live="polite"
            >
              {saveStatus === 'saving'
                ? t('editor.saving')
                : saveStatus === 'saved'
                  ? t('editor.saved')
                  : saveStatus === 'error'
                    ? t('editor.saveFailed')
                    : ''}
            </span>
          ) : null}
          <Link
            className="button secondary"
            to={reviewOnly ? `/stories/${storyId}/play` : simulationPath}
          >
            {t(
              reviewOnly
                ? 'editor.openReader'
                : selected
                  ? 'editor.testFromCurrent'
                  : 'editor.test',
            )}
          </Link>
        </div>
      </div>
      {error ? (
        <div className="save-error" role="alert">
          <span>{error}</span>
          <button className="secondary" type="button" onClick={() => void retry()}>
            {t('editor.reloadStory')}
          </button>
        </div>
      ) : null}
      <div
        className={`editor-layout with-navigation ${isLocationPanelOpen ? '' : 'with-navigation-collapsed'} ${
          hasInspector ? 'with-inspector' : ''
        } ${showContextualComments ? 'with-comment-rail' : ''}`}
      >
        <nav
          className={`location-panel ${isLocationPanelOpen ? '' : 'collapsed'}`}
          aria-label={t('editor.context')}
        >
          <button
            className="ghost navigation-toggle"
            type="button"
            aria-label={t(isLocationPanelOpen ? 'editor.collapseContext' : 'editor.expandContext')}
            aria-expanded={isLocationPanelOpen}
            aria-controls="story-context-panel-content"
            onClick={toggleContextPanel}
          >
            {isLocationPanelOpen ? '‹' : '›'}
          </button>
          {isLocationPanelOpen ? (
            <div className="location-panel-content" id="story-context-panel-content">
              <div className="context-search">
                <input
                  type="search"
                  aria-label={t('editor.search')}
                  placeholder={t('editor.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                <button
                  className="ghost"
                  type="button"
                  aria-label={t('editor.previousOccurrence')}
                  title={t('editor.previousOccurrence')}
                  disabled={navigationInteractionIds.length === 0}
                  onClick={() => navigateInteractions(-1)}
                >
                  ↑
                </button>
                <button
                  className="ghost"
                  type="button"
                  aria-label={t('editor.nextOccurrence')}
                  title={t('editor.nextOccurrence')}
                  disabled={navigationInteractionIds.length === 0}
                  onClick={() => navigateInteractions(1)}
                >
                  ↓
                </button>
                <span className="context-search-count" aria-live="polite">
                  {navigationInteractionIds.length === 0
                    ? '0 / 0'
                    : `${currentNavigationIndex + 1} / ${navigationInteractionIds.length}`}
                </span>
              </div>
              <div className="location-panel-header">
                <button
                  className="ghost context-heading"
                  type="button"
                  aria-expanded={openContextSections.locations}
                  onClick={() => toggleContextSection('locations')}
                >
                  <span className="context-heading-label">
                    <span aria-hidden="true">{openContextSections.locations ? '▾' : '▸'}</span>
                    {t('editor.locations')}
                  </span>
                  <small aria-label={formatCount(story.locations?.length ?? 0, 'location')}>
                    {story.locations?.length ?? 0}
                  </small>
                </button>
                {!reviewOnly ? (
                  <button
                    aria-label={t('editor.addLocation')}
                    type="button"
                    onClick={() => void addLocation()}
                  >
                    {t('editor.add')}
                  </button>
                ) : null}
              </div>
              {!openContextSections.locations ? null : (story.locations?.length ?? 0) === 0 ? (
                <p className="hint">{t('editor.noLocations')}</p>
              ) : (
                <CategorizedContextList
                  items={filteredLocations}
                  renderItem={(location) => (
                    <li key={location.id}>
                      <button
                        type="button"
                        aria-label={location.name}
                        className={location.id === selectedLocationId ? 'selected' : 'ghost'}
                        onClick={() => {
                          clearSearch();
                          selectExclusive({ type: 'location', id: location.id });
                        }}
                      >
                        <ContextThumbnail imageUrl={location.imageUrl} fallback="⌖" />
                        <span className="context-row-copy">
                          <strong>{location.name}</strong>
                          <small>
                            {formatCount(
                              contextReferenceCounts.locations.get(location.id) ?? 0,
                              'interaction',
                            )}
                          </small>
                        </span>
                      </button>
                    </li>
                  )}
                />
              )}
              <div className="location-panel-header context-section">
                <button
                  className="ghost context-heading"
                  type="button"
                  aria-expanded={openContextSections.characters}
                  onClick={() => toggleContextSection('characters')}
                >
                  <span className="context-heading-label">
                    <span aria-hidden="true">{openContextSections.characters ? '▾' : '▸'}</span>
                    {t('editor.characters')}
                  </span>
                  <small aria-label={formatCount(story.characters?.length ?? 0, 'character')}>
                    {story.characters?.length ?? 0}
                  </small>
                </button>
                {!reviewOnly ? (
                  <button
                    aria-label={t('editor.addCharacter')}
                    type="button"
                    onClick={() => void addCharacter()}
                  >
                    {t('editor.add')}
                  </button>
                ) : null}
              </div>
              {!openContextSections.characters ? null : (story.characters?.length ?? 0) === 0 ? (
                <p className="hint">{t('editor.noCharacters')}</p>
              ) : (
                <CategorizedContextList
                  items={filteredCharacters}
                  renderItem={(character) => (
                    <li key={character.id}>
                      <button
                        type="button"
                        aria-label={character.name}
                        className={character.id === selectedCharacterId ? 'selected' : 'ghost'}
                        onClick={() => {
                          clearSearch();
                          selectExclusive({ type: 'character', id: character.id });
                        }}
                      >
                        <ContextThumbnail
                          imageUrl={character.imageUrl}
                          fallback={getInitials(character.name)}
                        />
                        <span className="context-row-copy">
                          <strong>{character.name}</strong>
                          <small>
                            {character.isPlayable ? `${t('editor.playable')} · ` : ''}
                            {formatCount(
                              contextReferenceCounts.characters.get(character.id) ?? 0,
                              'interaction',
                            )}
                          </small>
                        </span>
                      </button>
                    </li>
                  )}
                />
              )}
              <div className="location-panel-header context-section">
                <button
                  className="ghost context-heading"
                  type="button"
                  aria-expanded={openContextSections.stats}
                  onClick={() => toggleContextSection('stats')}
                >
                  <span className="context-heading-label">
                    <span aria-hidden="true">{openContextSections.stats ? '▾' : '▸'}</span>
                    {t('attributes.title')}
                  </span>
                  <small aria-label={formatCount(story.statDefinitions?.length ?? 0, 'stat')}>
                    {story.statDefinitions?.length ?? 0}
                  </small>
                </button>
                {!reviewOnly ? (
                  <button
                    aria-label={t('editor.addStatDefinition')}
                    type="button"
                    onClick={addStatDefinition}
                  >
                    {t('editor.add')}
                  </button>
                ) : null}
              </div>
              {!openContextSections.stats ? null : (story.statDefinitions?.length ?? 0) === 0 ? (
                <p className="hint">{t('editor.noStats')}</p>
              ) : (
                <CategorizedContextList
                  items={filteredStatDefinitions}
                  renderItem={(definition) => (
                    <li key={definition.id}>
                      <button
                        type="button"
                        aria-label={definition.name}
                        className={
                          definition.id === selectedStatDefinitionId ? 'selected' : 'ghost'
                        }
                        onClick={() => {
                          clearSearch();
                          selectExclusive({ type: 'statDefinition', id: definition.id });
                        }}
                      >
                        <ContextThumbnail imageUrl={definition.imageUrl} fallback="↗" />
                        <span className="context-row-copy">
                          <strong>{definition.name}</strong>
                          <small>
                            {t(`attributes.type.${definition.valueType ?? 'number'}`)} ·{' '}
                            {formatCount(
                              contextReferenceCounts.stats.get(definition.id) ?? 0,
                              'assignment',
                            )}
                          </small>
                        </span>
                      </button>
                    </li>
                  )}
                />
              )}
              <div className="location-panel-header context-section">
                <button
                  className="ghost context-heading"
                  type="button"
                  aria-expanded={openContextSections.items}
                  onClick={() => toggleContextSection('items')}
                >
                  <span className="context-heading-label">
                    <span aria-hidden="true">{openContextSections.items ? '▾' : '▸'}</span>
                    {t('editor.items')}
                  </span>
                  <small aria-label={formatCount(story.itemDefinitions?.length ?? 0, 'item')}>
                    {story.itemDefinitions?.length ?? 0}
                  </small>
                </button>
                {!reviewOnly ? (
                  <button
                    aria-label={t('editor.addItemDefinition')}
                    type="button"
                    onClick={() => void addItemDefinition()}
                  >
                    {t('editor.add')}
                  </button>
                ) : null}
              </div>
              {!openContextSections.items ? null : (story.itemDefinitions?.length ?? 0) === 0 ? (
                <p className="hint">{t('editor.noItems')}</p>
              ) : (
                <CategorizedContextList
                  items={filteredItemDefinitions}
                  renderItem={(definition) => (
                    <li key={definition.id}>
                      <button
                        type="button"
                        aria-label={definition.name}
                        className={
                          definition.id === selectedItemDefinitionId ? 'selected' : 'ghost'
                        }
                        onClick={() => {
                          clearSearch();
                          selectExclusive({ type: 'itemDefinition', id: definition.id });
                        }}
                      >
                        <ContextThumbnail imageUrl={definition.imageUrl} fallback="▣" />
                        <span className="context-row-copy">
                          <strong>{definition.name}</strong>
                          <small>
                            {formatCount(
                              contextReferenceCounts.items.get(definition.id) ?? 0,
                              'instance',
                            )}
                          </small>
                        </span>
                      </button>
                    </li>
                  )}
                />
              )}
            </div>
          ) : null}
        </nav>
        <section className="canvas" ref={canvasRef}>
          <StoryCanvasToolbar
            canEdit={!reviewOnly}
            canComment={story.capabilities?.canComment === true}
            canOrganize={story.interactions.length > 0}
            organizeSelectionCount={selectedLayoutTargets.length}
            placingComment={placingComment}
            canUndo={history.canUndo}
            canRedo={history.canRedo}
            historyBusy={historyBusy || saveStatus === 'saving' || saveStatus === 'error'}
            onUndo={() => void undo()}
            onRedo={() => void redo()}
            onCreateRoot={() => void createRootFromClick()}
            onAddFrame={() => void addGraphDecoration('frame')}
            onAddText={() => void addGraphDecoration('text')}
            onOrganize={() => void organizeGraph()}
            onToggleCommentPlacement={() => setPlacingComment((placing) => !placing)}
          />
          {canvasContextMenu ? (
            <StoryCanvasContextMenu
              position={canvasContextMenu.screenPosition}
              canEdit={!reviewOnly}
              canComment={story.capabilities?.canComment === true}
              canOrganize={story.interactions.length > 0}
              organizeSelectionCount={selectedLayoutTargets.length}
              onCreateInteraction={() => void createRoot(canvasContextMenu.flowPosition)}
              onAddComment={() => startCanvasComment(canvasContextMenu.flowPosition)}
              onAddFrame={() => void addGraphDecoration('frame', canvasContextMenu.flowPosition)}
              onAddText={() => void addGraphDecoration('text', canvasContextMenu.flowPosition)}
              onOrganizeAll={() => void organizeGraph('all')}
              onOrganizeSelection={() => void organizeGraph('selection')}
              onClose={() => setCanvasContextMenu(undefined)}
            />
          ) : null}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(instance) => {
              flowInstance.current = instance;
            }}
            onNodesChange={handleNodesChange}
            onConnect={reviewOnly ? undefined : requestConnection}
            onConnectStart={reviewOnly ? undefined : startCanvasConnection}
            onConnectEnd={reviewOnly ? undefined : endCanvasConnection}
            onNodeClick={select}
            onPaneClick={handlePaneClick}
            onPaneContextMenu={handlePaneContextMenu}
            onSelectionStart={reviewOnly ? undefined : handleGraphSelectionStart}
            onSelectionChange={reviewOnly ? undefined : handleGraphSelectionChange}
            onSelectionEnd={reviewOnly ? undefined : handleGraphSelectionEnd}
            onNodeDragStart={reviewOnly ? undefined : handleNodeDragStart}
            onNodeDrag={reviewOnly ? undefined : handleNodeDrag}
            onNodeDragStop={(_, node, draggedNodes) => {
              if (reviewOnly) return;
              if (node.type === 'interaction' || node.type === 'trigger') {
                void persistNodeDrag(node, draggedNodes);
                return;
              }
              if (node.type === 'graphDecoration') {
                void updateGraphDecoration(node.id, { position: node.position });
              }
              endLocalEdit();
            }}
            fitView
            fitViewOptions={fitViewOptions}
            minZoom={0.05}
            panOnDrag={canvasPanMouseButtons}
            panActivationKeyCode="Space"
            selectionOnDrag={!reviewOnly}
            selectionMode={SelectionMode.Full}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </section>
        {showContextualComments ? (
          <ContextualCommentsRail
            threads={selectedTargetThreads}
            selectedThreadId={comments.selectedThreadId}
            draftAnchor={contextualDraftAnchor}
            error={comments.error}
            canComment={story.capabilities?.canComment === true}
            canManageThread={canManageCommentThread}
            onSelect={comments.selectThread}
            onCreate={comments.create}
            onCancelDraft={comments.cancelDraft}
            onReply={comments.reply}
            onStatus={comments.setStatus}
            onReattach={reattachSelectedThread}
          />
        ) : null}
        {commentsOpen ? (
          <StoryCommentsPanel
            open
            placement="inspector"
            loading={comments.loading}
            error={comments.error}
            threads={projectedCommentThreads}
            canComment={story.capabilities?.canComment === true}
            realtimeStatus={comments.realtimeStatus}
            onClose={() => setCommentsOpen(false)}
            onSelect={(threadId) => {
              if (threadId) focusCommentThread(threadId);
            }}
            onCancelDraft={comments.cancelDraft}
            onCreate={comments.create}
            onReply={comments.reply}
            onStatus={comments.setStatus}
          />
        ) : hasInspectorSelection ? (
          <aside className="inspector" aria-label={t('editor.inspector')}>
            <div className="inspector-header">
              {selectedCommentTarget && story.capabilities?.canComment ? (
                <div className="inspector-comment-actions">
                  <button className="secondary" type="button" onClick={startEntityComment}>
                    {t('comments.commentEntity')}
                  </button>
                  <button
                    className="ghost"
                    type="button"
                    title={t('comments.selectTextHelp')}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      startTextComment();
                    }}
                  >
                    {t('comments.commentSelection')}
                  </button>
                </div>
              ) : null}
              <button
                className="ghost inspector-close"
                type="button"
                aria-label={t('editor.closeInspector')}
                onClick={closeInspector}
              >
                x
              </button>
            </div>
            {graphSelection ? (
              <StoryGraphSelectionInspector selection={graphSelection} />
            ) : selectedGraphDecoration ? (
              <GraphDecorationInspector
                decoration={selectedGraphDecoration}
                onPatch={(patch) => void updateGraphDecoration(selectedGraphDecoration.id, patch)}
                onDelete={() => {
                  const decorationId = selectedGraphDecoration.id;
                  closeInspector();
                  void deleteGraphDecoration(decorationId);
                }}
              />
            ) : !reviewOnly && (isCreatingStatDefinition || selectedStatDefinition) ? (
              <StatDefinitionInspector
                categorySuggestions={statCategories}
                creating={isCreatingStatDefinition}
                key={selectedStatDefinition?.id ?? 'creating-stat-definition'}
                onChange={updateLocalStatDefinition}
                onClose={closeInspector}
                onCreate={async (input) => {
                  const definitionId = await createStatDefinition(input);
                  if (definitionId) {
                    selectExclusive({ type: 'statDefinition', id: definitionId });
                  }
                  return definitionId;
                }}
                onPatch={updateStatDefinition}
                onStory={setStory}
                statDefinition={selectedStatDefinition}
                story={story}
              />
            ) : reviewOnly ? (
              <ReviewTargetInspector
                interaction={selected}
                trigger={selectedTriggerTarget?.trigger}
                location={selectedLocation}
                character={selectedCharacter}
                statDefinition={selectedStatDefinition}
                itemDefinition={selectedItemDefinition}
              />
            ) : selected ? (
              <InteractionInspector
                story={story}
                interaction={selected}
                onChange={(next) => setStory(next)}
                onPatch={patchInteraction}
                onDelete={remove}
                onSelectInteraction={(interactionId) =>
                  selectExclusive({ type: 'interaction', id: interactionId })
                }
              />
            ) : selectedTriggerTarget ? (
              <TriggerInspector
                story={story}
                interaction={selectedTriggerTarget.interaction}
                trigger={selectedTriggerTarget.trigger}
                onSaveTrigger={saveTrigger}
                onCreateTriggerVariant={createSelectedTriggerVariant}
                onDeleteTriggerGroup={deleteSelectedTriggerGroup}
                onDeleteTrigger={deleteSelectedTrigger}
                onDeleteTriggerVariants={deleteSelectedTriggerVariants}
              />
            ) : selectedLocation ? (
              <LocationInspector
                location={selectedLocation}
                categorySuggestions={locationCategories}
                onLocalChange={updateLocalLocation}
                onPatch={updateLocation}
                itemDefinitions={story.itemDefinitions ?? []}
                statDefinitions={story.statDefinitions ?? []}
                onMoveItem={moveItemInstance}
              />
            ) : selectedCharacter ? (
              <CharacterInspector
                character={selectedCharacter}
                categorySuggestions={characterCategories}
                statDefinitions={story.statDefinitions ?? []}
                itemDefinitions={story.itemDefinitions ?? []}
                onChange={updateLocalCharacter}
                onPatch={updateCharacter}
                onCreateStat={createCharacterStat}
                onPatchStat={updateCharacterStat}
                onDeleteStat={deleteCharacterStat}
                onCreateItem={createCharacterItem}
                onDeleteItem={deleteCharacterItem}
                onMoveItem={moveItemInstance}
              />
            ) : selectedItemDefinition ? (
              <ItemDefinitionInspector
                itemDefinition={selectedItemDefinition}
                categorySuggestions={itemCategories}
                statDefinitions={story.statDefinitions ?? []}
                onChange={updateLocalItemDefinition}
                onPatch={updateItemDefinition}
              />
            ) : null}
          </aside>
        ) : null}
      </div>
      {pending && existingTriggerChoices.length > 0 ? (
        <div className="connection-dialog-backdrop">
          <section
            className="connection-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connection-dialog-title"
          >
            <h2 id="connection-dialog-title">{t('editor.connection.title')}</h2>
            <p>{t('editor.connection.description')}</p>
            <div className="connection-dialog-actions">
              {existingTriggerChoices.map((trigger, index) => (
                <button
                  className="secondary"
                  type="button"
                  key={trigger.id}
                  onClick={() => extendPendingTrigger(trigger.id)}
                >
                  {t('editor.connection.addToGroup', { number: index + 1 })}
                </button>
              ))}
              <button type="button" onClick={createPendingTrigger}>
                {t('editor.connection.createTrigger')}
              </button>
              <button className="ghost" type="button" onClick={cancelPendingConnection}>
                {t('editor.connection.cancel')}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function ReviewTargetInspector({
  interaction,
  trigger,
  location,
  character,
  statDefinition,
  itemDefinition,
}: {
  interaction?: Interaction;
  trigger?: Trigger;
  location?: Location;
  character?: Character;
  statDefinition?: StatDefinition;
  itemDefinition?: ItemDefinition;
}) {
  const { t } = useTranslation();
  if (interaction) {
    return (
      <div className="review-target-inspector">
        <h3>{t('inspector.interaction')}</h3>
        <h2 data-comment-field="title">{interaction.title}</h2>
        <div data-comment-field="body">
          <RichTextContent html={interaction.body} />
        </div>
      </div>
    );
  }
  if (trigger) {
    return (
      <div className="review-target-inspector">
        <h3>{t('inspector.trigger')}</h3>
        <p>{t('comments.triggerSummary', { count: trigger.conditions.length })}</p>
      </div>
    );
  }
  const target = location ?? character ?? itemDefinition ?? statDefinition;
  if (!target) return null;
  const type = location ? 'location' : character ? 'character' : itemDefinition ? 'item' : 'stat';
  return (
    <div className="review-target-inspector">
      <h3>{t(`inspector.${type}`)}</h3>
      <h2 data-comment-field="name">{target.name}</h2>
      {'description' in target && target.description ? (
        <p data-comment-field="description">{target.description}</p>
      ) : null}
    </div>
  );
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

function applyInteractionSizeChanges(
  current: ReadonlyMap<string, { width: number; height: number }>,
  changes: NodeChange<StoryFlowNode>[],
  interactionIds: ReadonlySet<string>,
) {
  let next: Map<string, { width: number; height: number }> | undefined;
  for (const change of changes) {
    if (change.type !== 'dimensions' || !change.dimensions || !interactionIds.has(change.id)) {
      continue;
    }
    const previous = (next ?? current).get(change.id);
    if (
      previous?.width === change.dimensions.width &&
      previous.height === change.dimensions.height
    ) {
      continue;
    }
    next ??= new Map(current);
    next.set(change.id, change.dimensions);
  }
  return next ?? current;
}
