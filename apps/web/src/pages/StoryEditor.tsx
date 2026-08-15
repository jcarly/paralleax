import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  Background,
  Controls,
  ReactFlow,
  useNodesState,
  type OnConnectEnd,
  type OnConnectStart,
  type Connection,
  type NodeMouseHandler,
  type ReactFlowInstance,
} from '@xyflow/react';
import { Link, useParams } from 'react-router-dom';
import {
  isCommentAnchorDetached,
  updateInteractionInStory,
  type Character,
  type CommentTargetType,
  type GraphDecoration,
  type Interaction,
  type ItemDefinition,
  type Location,
  type Position,
  type StatDefinition,
  type Trigger,
} from '@paralleax/shared';
import { CharacterInspector } from '../components/CharacterInspector';
import { InteractionInspector } from '../components/InteractionInspector';
import { InteractionNode } from '../components/InteractionNode';
import { ItemDefinitionInspector } from '../components/ItemDefinitionInspector';
import { LocationInspector } from '../components/LocationInspector';
import { StatDefinitionInspector } from '../components/StatDefinitionInspector';
import { TriggerEdge } from '../components/TriggerEdge';
import { TriggerInspector } from '../components/TriggerInspector';
import { TriggerNode } from '../components/TriggerNode';
import { RichTextContent } from '../components/RichTextContent';
import { CommentPinNode, type CommentPinFlowNode } from '../features/comments/CommentPinNode';
import { StoryCommentsPanel } from '../features/comments/StoryCommentsPanel';
import { captureActiveTextSelection } from '../features/comments/textAnchors';
import { useStoryComments } from '../features/comments/useStoryComments';
import { GraphDecorationInspector } from '../features/graph-decorations/GraphDecorationInspector';
import { GraphDecorationNode } from '../features/graph-decorations/GraphDecorationNode';
import { buildGraphDecorationNodes } from '../features/graph-decorations/graphDecorationNodes';
import { useStoryEditorPersistence } from '../hooks/useStoryEditorPersistence';
import { usePendingSaveGuard } from '../hooks/usePendingSaveGuard';
import {
  buildInteractionNodes,
  buildTriggerNodes,
  buildTriggerEdges,
  type SelectedTrigger,
  type StoryFlowNode,
  type TriggerFlowEdge,
} from '../storyGraph';
import { findInteraction, findSelectedTrigger } from '../storySelection';
import { getPendingConnection } from '../storyConnection';
import {
  getInteractionTextOccurrenceCounts,
  getReferencedInteractionIds,
  type StoryContextReference,
} from '../storyNavigation';

const nodeTypes = {
  interaction: InteractionNode,
  trigger: TriggerNode,
  graphDecoration: GraphDecorationNode,
  commentPin: CommentPinNode,
};
const edgeTypes = { trigger: TriggerEdge };
const droppedNodeOffset = { x: 105, y: 48 };
const fitViewOptions = { padding: 0.18, maxZoom: 1 };
const canvasPanMouseButtons = [1];
const storyContextPanelStorageKey = 'paralleax-story-context-panel';

function getInitialStoryContextPanelOpen() {
  try {
    return window.localStorage.getItem(storyContextPanelStorageKey) !== 'collapsed';
  } catch {
    return true;
  }
}

function ContextThumbnail({ imageUrl, fallback }: { imageUrl?: string; fallback: string }) {
  return imageUrl ? (
    <img className="context-picto" src={imageUrl} alt="" />
  ) : (
    <span className="context-picto context-picto-placeholder" aria-hidden="true">
      {fallback}
    </span>
  );
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

function getCategorySuggestions(items: Array<{ category?: string }>) {
  return [
    ...new Set(items.map(({ category }) => category?.trim()).filter(Boolean) as string[]),
  ].sort((left, right) => left.localeCompare(right));
}

function matchesContextSearch(entity: { name: string; category?: string }, query: string) {
  return [entity.name, entity.category ?? ''].some((value) =>
    value.toLocaleLowerCase().includes(query),
  );
}

function groupContextEntities<T extends { id: string; category?: string }>(
  items: T[],
  uncategorizedLabel: string,
) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const category = item.category?.trim() || uncategorizedLabel;
    groups.set(category, [...(groups.get(category) ?? []), item]);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => {
      if (left === uncategorizedLabel) return 1;
      if (right === uncategorizedLabel) return -1;
      return left.localeCompare(right);
    })
    .map(([category, groupedItems]) => ({ category, items: groupedItems }));
}

function CategorizedContextList<T extends { id: string; category?: string }>({
  items,
  renderItem,
}: {
  items: T[];
  renderItem: (item: T) => ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="context-category-list">
      {groupContextEntities(items, t('editor.uncategorized')).map(
        ({ category, items: groupedItems }) => (
          <section className="context-category-group" key={category}>
            <div className="context-category-heading">
              <span>{category}</span>
              <small>{groupedItems.length}</small>
            </div>
            <ul>{groupedItems.map(renderItem)}</ul>
          </section>
        ),
      )}
    </div>
  );
}

export function StoryEditor({ currentUserId }: { currentUserId?: string }) {
  const { t } = useTranslation();
  const { storyId = '' } = useParams();
  const {
    story,
    setStory,
    error,
    saveStatus,
    retry,
    renameStory,
    updateStoryStartDateTime,
    saveTrigger,
    moveTrigger,
    createTriggerVariant,
    deleteTrigger,
    deleteTriggerVariants,
    deleteTriggerInput,
    connectInteractions,
    connectToExistingTrigger,
    createRoot,
    createChild,
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
  const [selectedId, setSelectedId] = useState<string>();
  const [selectedTrigger, setSelectedTrigger] = useState<SelectedTrigger>();
  const [selectedGraphDecorationId, setSelectedGraphDecorationId] = useState<string>();
  const [selectedLocationId, setSelectedLocationId] = useState<string>();
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>();
  const [selectedStatDefinitionId, setSelectedStatDefinitionId] = useState<string>();
  const [selectedItemDefinitionId, setSelectedItemDefinitionId] = useState<string>();
  const [searchQuery, setSearchQuery] = useState('');
  const [isLocationPanelOpen, setIsLocationPanelOpen] = useState(getInitialStoryContextPanelOpen);
  const [openContextSections, setOpenContextSections] = useState({
    locations: true,
    characters: true,
    stats: true,
    items: true,
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [pendingConnection, setPendingConnection] = useState<Connection>();
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [placingComment, setPlacingComment] = useState(false);
  const [interactionDragPreview, setInteractionDragPreview] = useState<{
    interactionId: string;
    position: Position;
  }>();
  const [nodes, setNodes, onNodesChange] = useNodesState<StoryFlowNode>([]);
  const pendingConnectionStart = useRef<{
    nodeId: string;
    handleType: 'source' | 'target';
  } | null>(null);
  const flowInstance = useRef<ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null>(null);
  const canvasRef = useRef<HTMLElement | null>(null);

  const commentAccess = Boolean(
    story?.capabilities?.canManage ||
    story?.capabilities?.canEdit ||
    story?.capabilities?.canComment,
  );
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
  const selectedCommentThread = projectedCommentThreads.find(
    ({ id }) => id === comments.selectedThreadId,
  );
  const projectedGraphStory = useMemo(
    () =>
      story && interactionDragPreview
        ? updateInteractionInStory(story, interactionDragPreview.interactionId, {
            position: interactionDragPreview.position,
          })
        : story,
    [interactionDragPreview, story],
  );

  const selected = findInteraction(story, selectedId);
  const selectedTriggerTarget = findSelectedTrigger(story, selectedTrigger);
  const selectedGraphDecoration = story?.graphDecorations?.find(
    ({ id }) => id === selectedGraphDecorationId,
  );
  const selectedLocation = story?.locations?.find(({ id }) => id === selectedLocationId);
  const selectedCharacter = story?.characters?.find(({ id }) => id === selectedCharacterId);
  const selectedStatDefinition = story?.statDefinitions?.find(
    ({ id }) => id === selectedStatDefinitionId,
  );
  const selectedItemDefinition = story?.itemDefinitions?.find(
    ({ id }) => id === selectedItemDefinitionId,
  );
  const selectedCommentTarget: { targetType: CommentTargetType; targetId: string } | undefined =
    selected
      ? { targetType: 'interaction', targetId: selected.id }
      : selectedTriggerTarget
        ? { targetType: 'trigger', targetId: selectedTriggerTarget.trigger.id }
        : selectedLocation
          ? { targetType: 'location', targetId: selectedLocation.id }
          : selectedCharacter
            ? { targetType: 'character', targetId: selectedCharacter.id }
            : selectedStatDefinition
              ? { targetType: 'statDefinition', targetId: selectedStatDefinition.id }
              : selectedItemDefinition
                ? { targetType: 'itemDefinition', targetId: selectedItemDefinition.id }
                : undefined;
  const selectedTargetThreads = selectedCommentTarget
    ? projectedCommentThreads.filter(
        (thread) =>
          thread.anchor.kind !== 'canvas' &&
          thread.anchor.targetType === selectedCommentTarget.targetType &&
          thread.anchor.targetId === selectedCommentTarget.targetId,
      )
    : [];
  const openCommentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const thread of projectedCommentThreads) {
      if (thread.status !== 'open' || thread.anchor.kind === 'canvas') continue;
      counts.set(thread.anchor.targetId, (counts.get(thread.anchor.targetId) ?? 0) + 1);
    }
    return counts;
  }, [projectedCommentThreads]);
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const occurrenceCounts = useMemo(
    () => getInteractionTextOccurrenceCounts(story, searchQuery),
    [searchQuery, story],
  );
  const selectedContextReference: StoryContextReference | undefined = useMemo(
    () =>
      selectedLocationId
        ? { type: 'location', id: selectedLocationId }
        : selectedCharacterId
          ? { type: 'character', id: selectedCharacterId }
          : selectedStatDefinitionId
            ? { type: 'stat', id: selectedStatDefinitionId }
            : selectedItemDefinitionId
              ? { type: 'item', id: selectedItemDefinitionId }
              : undefined,
    [selectedCharacterId, selectedItemDefinitionId, selectedLocationId, selectedStatDefinitionId],
  );
  const referencedInteractionIds = useMemo(
    () => getReferencedInteractionIds(story, selectedContextReference),
    [selectedContextReference, story],
  );
  const navigationInteractionIds = useMemo(
    () => (normalizedSearchQuery ? [...occurrenceCounts.keys()] : referencedInteractionIds),
    [normalizedSearchQuery, occurrenceCounts, referencedInteractionIds],
  );
  const currentNavigationIndex = selectedId ? navigationInteractionIds.indexOf(selectedId) : -1;
  const emphasizedInteractionIds = useMemo(
    () =>
      selectedContextReference?.type === 'location' ||
      selectedContextReference?.type === 'character'
        ? new Set(referencedInteractionIds)
        : undefined,
    [referencedInteractionIds, selectedContextReference?.type],
  );
  const filteredLocations = (story?.locations ?? []).filter((location) =>
    matchesContextSearch(location, normalizedSearchQuery),
  );
  const filteredCharacters = (story?.characters ?? []).filter((character) =>
    matchesContextSearch(character, normalizedSearchQuery),
  );
  const filteredStatDefinitions = (story?.statDefinitions ?? []).filter((definition) =>
    matchesContextSearch(definition, normalizedSearchQuery),
  );
  const filteredItemDefinitions = (story?.itemDefinitions ?? []).filter((definition) =>
    matchesContextSearch(definition, normalizedSearchQuery),
  );
  const locationCategories = getCategorySuggestions(story?.locations ?? []);
  const characterCategories = getCategorySuggestions(story?.characters ?? []);
  const statCategories = getCategorySuggestions(story?.statDefinitions ?? []);
  const itemCategories = getCategorySuggestions(story?.itemDefinitions ?? []);
  const contextReferenceCounts = useMemo(() => {
    const locations = new Map<string, number>();
    const characters = new Map<string, number>();
    const stats = new Map<string, number>();
    const items = new Map<string, number>();

    for (const interaction of story?.interactions ?? []) {
      if (interaction.locationId) {
        locations.set(interaction.locationId, (locations.get(interaction.locationId) ?? 0) + 1);
      }
      for (const characterId of interaction.characterIds ?? []) {
        characters.set(characterId, (characters.get(characterId) ?? 0) + 1);
      }
    }
    for (const character of story?.characters ?? []) {
      for (const stat of character.stats ?? []) {
        stats.set(stat.statDefinitionId, (stats.get(stat.statDefinitionId) ?? 0) + 1);
      }
      for (const item of character.items ?? []) {
        items.set(item.itemDefinitionId, (items.get(item.itemDefinitionId) ?? 0) + 1);
      }
    }
    for (const location of story?.locations ?? []) {
      for (const item of location.items ?? []) {
        items.set(item.itemDefinitionId, (items.get(item.itemDefinitionId) ?? 0) + 1);
      }
    }

    return { locations, characters, stats, items };
  }, [story]);
  const hasInspectorSelection = Boolean(
    selected ||
    selectedTriggerTarget ||
    selectedGraphDecoration ||
    selectedLocation ||
    selectedCharacter ||
    selectedStatDefinition ||
    selectedItemDefinition,
  );

  const closeInspector = useCallback(() => {
    setSelectedId(undefined);
    setSelectedTrigger(undefined);
    setSelectedGraphDecorationId(undefined);
    setSelectedLocationId(undefined);
    setSelectedCharacterId(undefined);
    setSelectedStatDefinitionId(undefined);
    setSelectedItemDefinitionId(undefined);
  }, []);

  const openCommentsForTarget = useCallback(
    (_targetType: CommentTargetType, targetId: string) => {
      const thread = projectedCommentThreads.find(
        (candidate) =>
          candidate.status === 'open' &&
          candidate.anchor.kind !== 'canvas' &&
          candidate.anchor.targetId === targetId,
      );
      if (thread) selectCommentThread(thread.id);
      setCommentsOpen(true);
    },
    [projectedCommentThreads, selectCommentThread],
  );

  const storyNodes = useMemo(
    () =>
      buildInteractionNodes(projectedGraphStory, selectedId, selectedTrigger, {
        showNewTriggerInput: !reviewOnly && isConnecting,
        onCreateChild: reviewOnly
          ? undefined
          : (interactionId) => void createChildFromInteraction(interactionId),
        onCreateParent: reviewOnly
          ? undefined
          : (interactionId) => void createParentForInteraction(interactionId),
        onSelectRootTrigger: (interactionId, triggerId) => {
          closeInspector();
          setSelectedTrigger({ interactionId, triggerId });
        },
        occurrenceCounts,
        emphasizedInteractionIds,
        commentCounts: openCommentCounts,
        onOpenComments: openCommentsForTarget,
      }),
    [
      closeInspector,
      createChildFromInteraction,
      createParentForInteraction,
      isConnecting,
      occurrenceCounts,
      emphasizedInteractionIds,
      openCommentCounts,
      openCommentsForTarget,
      reviewOnly,
      selectedId,
      selectedTrigger,
      projectedGraphStory,
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
      buildTriggerNodes(projectedGraphStory, selectedTrigger, {
        onSelectTrigger: (interactionId, triggerId) => {
          closeInspector();
          setSelectedTrigger({ interactionId, triggerId });
        },
        commentCounts: openCommentCounts,
        onOpenComments: openCommentsForTarget,
      }),
    [
      closeInspector,
      openCommentCounts,
      openCommentsForTarget,
      projectedGraphStory,
      selectedTrigger,
    ],
  );

  const commentNodes = useMemo<CommentPinFlowNode[]>(
    () =>
      projectedCommentThreads.flatMap((thread) =>
        thread.anchor.kind === 'canvas'
          ? [
              {
                id: `comment:${thread.id}`,
                type: 'commentPin' as const,
                position: thread.anchor.position,
                draggable: false,
                selectable: false,
                data: {
                  threadId: thread.id,
                  messageCount: thread.messages.length,
                  resolved: thread.status === 'resolved',
                  detached: thread.detached,
                  onOpen: (threadId: string) => {
                    selectCommentThread(threadId);
                    setCommentsOpen(true);
                  },
                },
              },
            ]
          : [],
      ),
    [projectedCommentThreads, selectCommentThread],
  );

  useEffect(() => {
    setNodes([
      ...decorationNodes,
      ...[...storyNodes, ...triggerNodes].map((node) =>
        reviewOnly ? { ...node, draggable: false } : node,
      ),
      ...commentNodes,
    ]);
  }, [commentNodes, decorationNodes, reviewOnly, setNodes, storyNodes, triggerNodes]);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        storyContextPanelStorageKey,
        isLocationPanelOpen ? 'open' : 'collapsed',
      );
    } catch {
      // The editor remains usable when browser storage is unavailable.
    }
  }, [isLocationPanelOpen]);

  const selectTriggerData = useCallback(
    (trigger: SelectedTrigger) => {
      closeInspector();
      setSelectedTrigger(trigger);
    },
    [closeInspector],
  );
  const deleteSelectedTriggerInput = useCallback(
    async (interactionId: string, triggerId: string, inputInteractionId: string) => {
      await deleteTriggerInput(interactionId, triggerId, inputInteractionId);
      setSelectedTrigger(undefined);
    },
    [deleteTriggerInput],
  );
  const edges = useMemo(
    () =>
      buildTriggerEdges(
        projectedGraphStory,
        selectTriggerData,
        (interactionId, triggerId, inputId) => {
          void deleteSelectedTriggerInput(interactionId, triggerId, inputId);
        },
      ),
    [deleteSelectedTriggerInput, projectedGraphStory, selectTriggerData],
  );

  const select: NodeMouseHandler = (_, node) => {
    if (node.type === 'graphDecoration') {
      if (reviewOnly) return;
      closeInspector();
      setSelectedGraphDecorationId(node.id);
      return;
    }
    if (node.type !== 'interaction') return;
    closeInspector();
    setSelectedId(node.id);
  };

  async function addGraphDecoration(kind: GraphDecoration['kind']) {
    const bounds = canvasRef.current?.getBoundingClientRect();
    const center = flowInstance.current?.screenToFlowPosition({
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
    closeInspector();
    setSelectedGraphDecorationId(decorationId);
  }

  function startEntityComment() {
    if (!selectedCommentTarget || !story?.capabilities?.canComment) return;
    comments.startThread({ kind: 'entity', ...selectedCommentTarget });
    comments.selectThread(undefined);
    setCommentsOpen(true);
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
    setCommentsOpen(true);
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
    if (placingComment && story?.capabilities?.canComment) {
      const position = flowInstance.current?.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      if (position) {
        comments.startThread({ kind: 'canvas', position });
        comments.selectThread(undefined);
        setCommentsOpen(true);
      }
      setPlacingComment(false);
      return;
    }
    closeInspector();
  }

  const navigateInteractions = (direction: -1 | 1) => {
    if (navigationInteractionIds.length === 0) return;
    const nextIndex =
      currentNavigationIndex < 0
        ? direction > 0
          ? 0
          : navigationInteractionIds.length - 1
        : (currentNavigationIndex + direction + navigationInteractionIds.length) %
          navigationInteractionIds.length;
    const interactionId = navigationInteractionIds[nextIndex];
    if (normalizedSearchQuery) closeInspector();
    else {
      setSelectedTrigger(undefined);
      setSelectedId(undefined);
    }
    setSelectedId(interactionId);
    window.requestAnimationFrame(() => {
      void flowInstance.current?.fitView({
        nodes: [{ id: interactionId }],
        duration: 250,
        padding: 0.7,
        maxZoom: 1,
      });
    });
  };

  const startCanvasConnection: OnConnectStart = (_, params) => {
    if (!params.nodeId || !params.handleType) {
      pendingConnectionStart.current = null;
      setIsConnecting(false);
      return;
    }
    pendingConnectionStart.current = {
      nodeId: params.nodeId,
      handleType: params.handleType,
    };
    setIsConnecting(true);
  };

  const endCanvasConnection: OnConnectEnd = (event, connectionState) => {
    const start = pendingConnectionStart.current;
    pendingConnectionStart.current = null;
    setIsConnecting(false);
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
    const position = getDroppedInteractionPosition(connectionState.pointer, flowInstance.current);

    if (start.handleType === 'source') {
      void createChildFromInteraction(start.nodeId, position);
      return;
    }

    void createParentForInteraction(start.nodeId, position);
  };

  async function deleteSelectedTrigger(interactionId: string, triggerId: string) {
    if (!window.confirm(t('editor.confirmDeleteTrigger'))) return;
    await deleteTrigger(interactionId, triggerId);
    setSelectedTrigger(undefined);
  }

  async function deleteSelectedTriggerGroup(
    interactionId: string,
    triggerId: string,
    nextTriggerId: string,
  ) {
    setSelectedTrigger({ interactionId, triggerId: nextTriggerId });
    await deleteTrigger(interactionId, triggerId);
  }

  async function createSelectedTriggerVariant(interactionId: string, triggerId: string) {
    const createdTriggerId = await createTriggerVariant(interactionId, triggerId);
    if (createdTriggerId) {
      setSelectedTrigger({ interactionId, triggerId: createdTriggerId });
    }
  }

  async function deleteSelectedTriggerVariants(interactionId: string, triggerIds: string[]) {
    if (!window.confirm(t('editor.confirmDeleteTriggerVariants'))) return;
    await deleteTriggerVariants(interactionId, triggerIds);
    setSelectedTrigger(undefined);
  }

  async function createSelectedChild() {
    if (!story || !selected) return;
    await createChild(selected);
  }

  async function remove() {
    if (!selected) return;
    if (!window.confirm(`Delete “${selected.title}” and its trigger links?`)) return;
    await deleteInteraction(selected.id);
    setSelectedId(undefined);
  }

  async function addLocation() {
    const locationId = await createLocation();
    if (!locationId) return;
    closeInspector();
    setSelectedLocationId(locationId);
    setIsLocationPanelOpen(true);
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
    closeInspector();
    setSelectedCharacterId(characterId);
    setIsLocationPanelOpen(true);
  }

  async function addStatDefinition() {
    const statDefinitionId = await createStatDefinition();
    if (!statDefinitionId) return;
    closeInspector();
    setSelectedStatDefinitionId(statDefinitionId);
    setIsLocationPanelOpen(true);
    setOpenContextSections((sections) => ({ ...sections, stats: true }));
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
    closeInspector();
    setSelectedItemDefinitionId(itemDefinitionId);
    setIsLocationPanelOpen(true);
    setOpenContextSections((sections) => ({ ...sections, items: true }));
  }

  function updateLocalItemDefinition(nextDefinition: NonNullable<typeof selectedItemDefinition>) {
    setStory({
      ...story!,
      itemDefinitions: (story?.itemDefinitions ?? []).map((definition) =>
        definition.id === nextDefinition.id ? nextDefinition : definition,
      ),
    });
  }

  function toggleContextSection(section: keyof typeof openContextSections) {
    setOpenContextSections((sections) => ({ ...sections, [section]: !sections[section] }));
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
  if (story.capabilities?.canEdit === false && !commentAccess) {
    return (
      <main className="page">
        <h1>{t('editor.readOnlyTitle')}</h1>
        <p>{t('editor.readOnlyDescription')}</p>
        <Link className="button secondary" to={`/stories/${storyId}/play`}>
          {t('editor.openReader')}
        </Link>
      </main>
    );
  }
  const simulationPath = selected
    ? `/stories/${storyId}/play?mode=simulation&startInteractionId=${encodeURIComponent(
        selected.id,
      )}`
    : `/stories/${storyId}/play?mode=simulation`;
  const pending = pendingConnection ? getPendingConnection(story, pendingConnection) : undefined;
  const existingTriggerChoices =
    pending?.target.triggers.filter(
      (trigger) => !trigger.inputInteractionIds.includes(pending.sourceId),
    ) ?? [];

  function requestConnection(connection: Connection) {
    const candidate = getPendingConnection(story, connection);
    if (!candidate) return;
    const canExtendExisting = candidate.target.triggers.some(
      (trigger) => !trigger.inputInteractionIds.includes(candidate.sourceId),
    );
    if (canExtendExisting) {
      setPendingConnection(connection);
      return;
    }
    void connectInteractions(connection);
  }

  function createPendingTrigger() {
    if (!pendingConnection) return;
    const connection = pendingConnection;
    setPendingConnection(undefined);
    void connectInteractions(connection);
  }

  function extendPendingTrigger(triggerId: string) {
    if (!pending) return;
    setPendingConnection(undefined);
    void connectToExistingTrigger(pending.sourceId, pending.target.id, triggerId);
  }

  return (
    <main className="editor-page">
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
              onClick={() => setCommentsOpen((open) => !open)}
            >
              {t('comments.title')}
              {comments.threads.filter(({ status }) => status === 'open').length ? (
                <small>{comments.threads.filter(({ status }) => status === 'open').length}</small>
              ) : null}
            </button>
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
          {!reviewOnly ? (
            <button disabled={!selected} onClick={() => void createSelectedChild()}>
              {t('editor.addChild')}
            </button>
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
          hasInspectorSelection ? 'with-inspector' : ''
        }`}
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
            onClick={() => setIsLocationPanelOpen((open) => !open)}
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
                          closeInspector();
                          setSearchQuery('');
                          setSelectedLocationId(location.id);
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
                          closeInspector();
                          setSearchQuery('');
                          setSelectedCharacterId(character.id);
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
                    {t('editor.stats')}
                  </span>
                  <small aria-label={formatCount(story.statDefinitions?.length ?? 0, 'stat')}>
                    {story.statDefinitions?.length ?? 0}
                  </small>
                </button>
                {!reviewOnly ? (
                  <button
                    aria-label={t('editor.addStatDefinition')}
                    type="button"
                    onClick={() => void addStatDefinition()}
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
                          closeInspector();
                          setSearchQuery('');
                          setSelectedStatDefinitionId(definition.id);
                        }}
                      >
                        <ContextThumbnail imageUrl={definition.imageUrl} fallback="↗" />
                        <span className="context-row-copy">
                          <strong>{definition.name}</strong>
                          <small>
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
                          closeInspector();
                          setSearchQuery('');
                          setSelectedItemDefinitionId(definition.id);
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
          {!reviewOnly ? (
            <button className="canvas-action" onClick={() => void createRoot()}>
              {t('editor.addRoot')}
            </button>
          ) : null}
          {!reviewOnly ? (
            <div className="canvas-decoration-actions">
              <button
                className="secondary"
                type="button"
                onClick={() => void addGraphDecoration('frame')}
              >
                {t('decoration.addFrame')}
              </button>
              <button
                className="secondary"
                type="button"
                onClick={() => void addGraphDecoration('text')}
              >
                {t('decoration.addText')}
              </button>
            </div>
          ) : null}
          {story.capabilities?.canComment ? (
            <button
              className={`canvas-comment-action secondary ${placingComment ? 'active' : ''}`}
              type="button"
              aria-pressed={placingComment}
              onClick={() => setPlacingComment((placing) => !placing)}
            >
              {t(placingComment ? 'comments.clickCanvas' : 'comments.placeOnCanvas')}
            </button>
          ) : null}
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onInit={(instance) => {
              flowInstance.current = instance;
            }}
            onNodesChange={onNodesChange}
            onConnect={reviewOnly ? undefined : requestConnection}
            onConnectStart={reviewOnly ? undefined : startCanvasConnection}
            onConnectEnd={reviewOnly ? undefined : endCanvasConnection}
            onNodeClick={select}
            onPaneClick={handlePaneClick}
            onNodeDrag={
              reviewOnly
                ? undefined
                : (_, node) => {
                    if (node.type === 'interaction') {
                      setInteractionDragPreview({
                        interactionId: node.id,
                        position: node.position,
                      });
                    }
                  }
            }
            onNodeDragStop={(_, node) => {
              if (!reviewOnly && node.type === 'interaction') {
                setInteractionDragPreview(undefined);
                void patchInteraction(node.id, { position: node.position });
              }
              if (!reviewOnly && node.type === 'trigger') {
                void moveTrigger(node.data.interactionId, node.data.triggerIds, node.position);
              }
              if (!reviewOnly && node.type === 'graphDecoration') {
                void updateGraphDecoration(node.id, { position: node.position });
              }
            }}
            fitView
            fitViewOptions={fitViewOptions}
            minZoom={0.05}
            panOnDrag={canvasPanMouseButtons}
            panActivationKeyCode="Space"
          >
            <Background />
            <Controls />
          </ReactFlow>
        </section>
        {hasInspectorSelection ? (
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
            {selectedTargetThreads.length ? (
              <div className="inspector-comment-markers">
                {selectedTargetThreads.map((thread) => (
                  <button
                    className={thread.status === 'resolved' ? 'resolved' : ''}
                    type="button"
                    key={thread.id}
                    aria-label={t('comments.openThread', { label: thread.anchorLabel })}
                    onClick={() => {
                      selectCommentThread(thread.id);
                      setCommentsOpen(true);
                    }}
                  >
                    <span aria-hidden="true">◆</span>
                    <span>
                      {thread.anchor.kind === 'text'
                        ? `“${thread.anchor.selector.exact}”`
                        : (thread.messages.at(-1)?.body ?? thread.anchorLabel)}
                    </span>
                    <small>{thread.messages.length}</small>
                  </button>
                ))}
              </div>
            ) : null}
            {selectedGraphDecoration ? (
              <GraphDecorationInspector
                decoration={selectedGraphDecoration}
                onPatch={(patch) => void updateGraphDecoration(selectedGraphDecoration.id, patch)}
                onDelete={() => {
                  const decorationId = selectedGraphDecoration.id;
                  closeInspector();
                  void deleteGraphDecoration(decorationId);
                }}
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
                onSelectInteraction={(interactionId) => {
                  closeInspector();
                  setSelectedId(interactionId);
                }}
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
            ) : selectedStatDefinition ? (
              <StatDefinitionInspector
                statDefinition={selectedStatDefinition}
                categorySuggestions={statCategories}
                onChange={updateLocalStatDefinition}
                onPatch={updateStatDefinition}
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
      <StoryCommentsPanel
        open={commentsOpen}
        loading={comments.loading}
        error={comments.error}
        threads={projectedCommentThreads}
        selectedThread={selectedCommentThread}
        draftAnchor={comments.draftAnchor}
        canComment={story.capabilities?.canComment === true}
        realtimeStatus={comments.realtimeStatus}
        canManageThread={Boolean(
          story.capabilities?.canManage ||
          story.capabilities?.canEdit ||
          (currentUserId && selectedCommentThread?.createdBy.id === currentUserId),
        )}
        onClose={() => setCommentsOpen(false)}
        onSelect={comments.selectThread}
        onCancelDraft={comments.cancelDraft}
        onCreate={comments.create}
        onReply={comments.reply}
        onStatus={comments.setStatus}
        onReattach={
          selectedCommentTarget &&
          (story.capabilities?.canManage ||
            story.capabilities?.canEdit ||
            selectedCommentThread?.createdBy.id === currentUserId) &&
          selectedCommentThread?.detached
            ? reattachSelectedThread
            : undefined
        }
      />
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
              <button
                className="ghost"
                type="button"
                onClick={() => setPendingConnection(undefined)}
              >
                {t('editor.connection.cancel')}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
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

function getDroppedInteractionPosition(
  pointer: Position | null,
  flow: ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null,
): Position | undefined {
  if (!pointer || !flow) return undefined;
  const flowPosition = flow.screenToFlowPosition(pointer);
  return {
    x: Math.round(flowPosition.x - droppedNodeOffset.x),
    y: Math.round(flowPosition.y - droppedNodeOffset.y),
  };
}
