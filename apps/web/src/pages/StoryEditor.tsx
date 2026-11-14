import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
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
  type ReactFlowProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import '../features/story-editor/graph/storyGraph.css';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import {
  canDeleteCommentThread as canActorDeleteCommentThread,
  canManageCommentThread as canActorManageCommentThread,
  commentSemanticSlotKey,
  getTriggerConditionGroups,
  getTriggerConditions,
  isCommentAnchor,
  isCommentAnchorDetached,
  type Character,
  type CommentAnchor,
  type CommentSemanticSlot,
  type CommentTargetType,
  type CommentTextField,
  type GraphDecoration,
  type Interaction,
  type ItemDefinition,
  type Location,
  type Position,
  type StatDefinition,
  type StoryCommentThread,
  type Story,
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
import { StoryGroupsPanel } from '../features/story-editor/navigation/StoryGroupsPanel';
import {
  CharacterContextSection,
  ItemDefinitionContextSection,
  LocationContextSection,
  StatDefinitionContextSection,
} from '../features/story-editor/navigation/StoryContextEntitySections';
import { StoryGraphSelectionInspector } from '../components/StoryGraphSelectionInspector';
import { TriggerEdge } from '../components/TriggerEdge';
import { TriggerNode } from '../components/TriggerNode';
import { describeTriggerCondition } from '../triggerConditionPresentation';
import { RichTextContent } from '../components/RichTextContent';
import {
  CommentPinNode,
  type CommentPinFlowNode,
  type CommentPinNodeData,
} from '../features/comments/CommentPinNode';
import { ContextualCommentsRail } from '../features/comments/ContextualCommentsRail';
import {
  InspectorCommentField,
  type InspectorTextCommentProps,
} from '../features/comments/InspectorCommentField';
import { StoryCommentsPanel } from '../features/comments/StoryCommentsPanel';
import { captureActiveTextSelection } from '../features/comments/textAnchors';
import { useStoryComments } from '../features/comments/useStoryComments';
import { GraphDecorationInspector } from '../features/graph-decorations/GraphDecorationInspector';
import { GraphDecorationNode } from '../features/graph-decorations/GraphDecorationNode';
import { buildGraphDecorationNodes } from '../features/graph-decorations/graphDecorationNodes';
import {
  storyHasAuthoredScene,
  storyHasBranchingChoice,
} from '../features/onboarding/branchingChoice';
import { useOnboarding } from '../features/onboarding/onboardingContext';
import { currentOnboardingStep } from '../features/onboarding/onboardingProgress';
import { interactionTitleForDisplay } from '../features/story/interactionTitlePresentation';
import { StoryUnavailablePage } from '../features/story/StoryUnavailablePage';
import { isRealtimeEditableTarget } from '../features/realtime/storyRealtime';
import { useStoryConnectionController } from '../features/story-editor/graph/useStoryConnectionController';
import { useTwoFingerCanvasPan } from '../features/story-editor/graph/useTwoFingerCanvasPan';
import {
  reconcileStoryFlowEdges,
  reconcileStoryFlowNodes,
} from '../features/story-editor/graph/storyFlowReconciliation';
import { getInitialStoryFitViewOptions } from '../features/story-editor/graph/storyGraphViewport';
import { StoryHistoryPanel } from '../features/story-editor/history/StoryHistoryPanel';
import { useStoryContextNavigation } from '../features/story-editor/navigation/useStoryContextNavigation';
import {
  useStoryEditorSelection,
  type StoryEditorExclusiveSelection,
} from '../features/story-editor/selection/useStoryEditorSelection';
import {
  StorySettingsDialog,
  StorySettingsIcon,
  type StorySettingsTab,
} from '../features/story-settings/StorySettingsDialog';
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
import { type StoryGraphLayoutScope, type StoryGraphLayoutTarget } from '../storyGraphLayout';
import {
  applyStoryGraphSelection,
  getStoryGraphSelectionTargets,
  type StoryGraphSelection,
} from '../storyGraphSelection';
import {
  getStoryGraphClickCreationPosition,
  type StoryGraphClickCreation,
} from '../storyGraphCreationLayout';
import { getReferencedInteractionIds, type StoryContextReference } from '../storyNavigation';
import { computeStoryGraphElkLayout, preloadStoryGraphElk } from '../storyGraphElkLayout';
import type { TriggerEdgeRoutes } from '../triggerEdgeRouting';

const TriggerInspector = lazy(() =>
  import('../components/TriggerInspector').then((module) => ({ default: module.TriggerInspector })),
);

const nodeTypes = {
  interaction: InteractionNode,
  trigger: TriggerNode,
  graphDecoration: GraphDecorationNode,
  commentPin: CommentPinNode,
};
const edgeTypes = { trigger: TriggerEdge };
const canvasPanMouseButtons = [1];

type StoryTitleControlProps = {
  story: Story;
  reviewOnly: boolean;
  setStory: (story: Story) => void;
  renameStory: ReturnType<typeof useStoryEditorPersistence>['renameStory'];
  settingsTriggerRef: { current: HTMLButtonElement | null };
  setStorySettingsTab: Dispatch<SetStateAction<StorySettingsTab | undefined>>;
  t: StoryEditorTranslate;
};

function StoryTitleControl({
  story,
  reviewOnly,
  setStory,
  renameStory,
  settingsTriggerRef,
  setStorySettingsTab,
  t,
}: StoryTitleControlProps) {
  return (
    <div className="story-title-control">
      {/* eslint-disable-next-line design-system/require-shared-form-control -- the inline Story title uses a display-heading editor */}
      <input
        aria-label={t('editor.storyTitle')}
        className="story-title-input"
        value={story.title}
        readOnly={reviewOnly}
        onChange={(event) => {
          if (!reviewOnly) {
            setStory({ ...story, title: event.target.value });
          }
        }}
        onBlur={(event) => {
          if (!reviewOnly) {
            void renameStory(event.target.value);
          }
        }}
      />
      {!reviewOnly ? (
        <button
          ref={settingsTriggerRef}
          className="story-settings-button"
          type="button"
          aria-label={t('storySettings.open')}
          data-tooltip={t('storySettings.open')}
          title={t('storySettings.open')}
          onClick={() => setStorySettingsTab('properties')}
        >
          <StorySettingsIcon />
        </button>
      ) : null}
    </div>
  );
}

type StoryEditorActionsProps = {
  loadPhase: string;
  commentAccess: boolean;
  commentsOpen: boolean;
  toggleCommentsList: () => void;
  realtimeStatus: string;
  saveStatus: string;
  reviewOnly: boolean;
  storyId: string;
  simulationFromStartPath: string;
  simulationPath: string;
  selected: Interaction | undefined;
  startingInteraction: Interaction | undefined;
  comments: Pick<ReturnType<typeof useStoryComments>, 'threads'>;
  t: StoryEditorTranslate;
};

function StoryEditorActions(props: StoryEditorActionsProps) {
  return (
    <div className="actions">
      <StoryEditorStatuses {...props} />
      {props.commentAccess ? (
        <CommentsToolbarButton
          threads={props.comments.threads}
          commentsOpen={props.commentsOpen}
          onClick={props.toggleCommentsList}
          t={props.t}
        />
      ) : null}
      <StorySimulationLinks {...props} />
    </div>
  );
}

function StoryEditorStatuses({
  loadPhase,
  realtimeStatus,
  saveStatus,
  reviewOnly,
  t,
}: StoryEditorActionsProps) {
  return (
    <>
      {loadPhase !== 'ready' ? (
        <span className="save-status saving" role="status" aria-live="polite">
          {t(`editor.loadingPhase.${loadPhase}`)}
        </span>
      ) : null}
      {!reviewOnly ? <RealtimeStatus status={realtimeStatus} t={t} /> : null}
      {!reviewOnly ? <StorySaveStatus status={saveStatus} t={t} /> : null}
    </>
  );
}

function RealtimeStatus({ status, t }: { status: string; t: StoryEditorTranslate }) {
  return (
    <span className={`story-realtime-status ${status}`} role="status" aria-live="polite">
      <span className={`realtime-status-dot ${status}`} aria-hidden="true" />
      {t(`editor.realtime.${status}`)}
    </span>
  );
}

function StorySaveStatus({ status, t }: { status: string; t: StoryEditorTranslate }) {
  const label = getStorySaveLabel(status, t);
  return (
    <span
      className={`save-status ${status}`}
      role="status"
      aria-label={t('editor.saveStatus')}
      aria-live="polite"
    >
      {label}
    </span>
  );
}

function getStorySaveLabel(status: string, t: StoryEditorTranslate) {
  switch (status) {
    case 'saving':
      return t('editor.saving');
    case 'saved':
      return t('editor.saved');
    case 'error':
      return t('editor.saveFailed');
    default:
      return '';
  }
}

function getStoryGraphLayoutTargets(
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

function useStoryGraphOrganization(input: StoryGraphOrganizationInput) {
  return (preference: 'auto' | 'all' | 'selection' = 'auto') =>
    runStoryGraphOrganization(input, preference);
}

function CommentsToolbarButton({
  threads,
  commentsOpen,
  onClick,
  t,
}: {
  threads: StoryCommentThread[];
  commentsOpen: boolean;
  onClick: () => void;
  t: StoryEditorTranslate;
}) {
  const openCount = threads.filter(
    ({ status, deletedAt }) => status === 'open' && !deletedAt,
  ).length;
  return (
    <button
      className={`secondary comments-toolbar-button ${commentsOpen ? 'active' : ''}`}
      type="button"
      onClick={onClick}
    >
      {t('comments.title')}
      {openCount > 0 ? <small>{openCount}</small> : null}
    </button>
  );
}

function StorySimulationLinks(props: StoryEditorActionsProps) {
  return props.reviewOnly ? (
    <Link className="button secondary" to={`/stories/${props.storyId}/play`}>
      {props.t('editor.openReader')}
    </Link>
  ) : (
    <>
      <Link
        className="button secondary"
        data-onboarding-target="simulation-launch"
        to={props.simulationFromStartPath}
      >
        {props.t('editor.testFromStart')}
      </Link>
      {props.selected && props.selected.id !== props.startingInteraction?.id ? (
        <Link className="button secondary" to={props.simulationPath}>
          {props.t('editor.testFromCurrent')}
        </Link>
      ) : null}
    </>
  );
}

function StoryEditorToolbar(props: StoryTitleControlProps & StoryEditorActionsProps) {
  return (
    <div className="editor-toolbar">
      <StoryTitleControl {...props} />
      <StoryEditorActions {...props} />
    </div>
  );
}

type StoryCanvasHistoryProps = {
  open: boolean;
  history: ReturnType<typeof useStoryEditorPersistence>['history'];
  busy: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClose: () => void;
};

function StoryCanvasConnectionAlert({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return open ? (
    <div
      className="save-error graph-connection-alert"
      role="alert"
      data-testid="trigger-connection-conflict"
    >
      <span>{t('editor.triggerConnectionExists')}</span>
      <button
        className="secondary"
        type="button"
        aria-label={t('editor.dismissConnectionConflict')}
        onClick={onClose}
      >
        ×
      </button>
    </div>
  ) : null;
}

function StoryCanvasHistoryLayer(props: StoryCanvasHistoryProps) {
  return props.open ? (
    <StoryHistoryPanel
      history={props.history}
      busy={props.busy}
      onUndo={props.onUndo}
      onRedo={props.onRedo}
      onClose={props.onClose}
    />
  ) : null;
}

type StoryEditorInspectorActions = Pick<
  ReturnType<typeof useStoryEditorPersistence>,
  | 'createStatDefinition'
  | 'updateStatDefinition'
  | 'setStory'
  | 'updateGraphDecoration'
  | 'updateLocation'
  | 'moveItemInstance'
  | 'updateCharacter'
  | 'createCharacterStat'
  | 'updateCharacterStat'
  | 'deleteCharacterStat'
  | 'createCharacterItem'
  | 'deleteCharacterItem'
  | 'updateItemDefinition'
  | 'patchInteraction'
  | 'saveTrigger'
> & {
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  closeInspector: () => void;
  toggleContextualComments: () => void;
  startEntityComment: () => void;
  startTextComment: () => void;
  openTextComments: (field: CommentTextField) => void;
  openSemanticComments: (slot: CommentSemanticSlot) => void;
  closeContextualComments: () => void;
  reattachSelectedThread: (threadId: string) => Promise<void>;
  deleteCommentThread: (threadId: string) => Promise<unknown>;
  restoreCommentThread: (threadId: string) => Promise<unknown>;
  focusCommentThread: (threadId: string) => void;
  deleteGraphElement: (target: StoryGraphElementContextTarget) => Promise<void>;
  deleteSelectedTrigger: (interactionId: string, triggerId: string) => Promise<void>;
  remove: () => Promise<void>;
  createEditorGroup: (
    title: string,
    ids: string[],
    parentGroupId?: string,
  ) => Promise<string | false>;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  updateLocalStatDefinition: (definition: StatDefinition) => void;
  updateLocalLocation: (location: Location) => void;
  updateLocalCharacter: (patch: Partial<Character>) => void;
  updateLocalItemDefinition: (definition: ItemDefinition) => void;
  reportStepComplete: ReturnType<typeof useOnboarding>['reportStepComplete'];
};

type StoryEditorInspectorModel = {
  story: Story;
  storyId: string;
  t: StoryEditorTranslate;
  reviewOnly: boolean;
  commentsOpen: boolean;
  hasInspectorSelection: boolean;
  selection: StoryEditorSelectionModel;
  comments: ReturnType<typeof useStoryComments>;
  projectedCommentThreads: StoryCommentThread[];
  selectedTargetThreads: StoryCommentThread[];
  contextualDraftAnchor: Exclude<CommentAnchor, { kind: 'canvas' }> | undefined;
  canManageCommentThread: (thread: StoryCommentThread) => boolean;
  canDeleteCommentThread: (thread: StoryCommentThread) => boolean;
  statCategories: string[];
  locationCategories: string[];
  characterCategories: string[];
  itemCategories: string[];
  commentSummary: {
    showContextualComments: boolean;
    selectedTargetCommentCount: number;
    selectedTextCommentCounts: Partial<Record<CommentTextField, number>>;
    selectedSemanticCommentCounts: Partial<Record<string, number>>;
  };
  actions: StoryEditorInspectorActions;
};

type StoryEditorInspectorActionsInput = {
  commentActions: ReturnType<typeof bindStoryEditorCommentActions>;
  entityActions: ReturnType<typeof useStoryEditorEntityActions>;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  closeInspector: () => void;
  deleteCommentThread: StoryEditorInspectorActions['deleteCommentThread'];
  restoreCommentThread: StoryEditorInspectorActions['restoreCommentThread'];
  focusCommentThread: StoryEditorInspectorActions['focusCommentThread'];
  deleteGraphElement: StoryEditorInspectorActions['deleteGraphElement'];
  deleteSelectedTrigger: StoryEditorInspectorActions['deleteSelectedTrigger'];
  remove: StoryEditorInspectorActions['remove'];
  createEditorGroup: StoryEditorInspectorActions['createEditorGroup'];
  updateGraphDecoration: StoryEditorInspectorActions['updateGraphDecoration'];
  selectExclusive: StoryEditorInspectorActions['selectExclusive'];
  reportStepComplete: StoryEditorInspectorActions['reportStepComplete'];
  persistence: ReturnType<typeof useStoryEditorPersistence>;
};

function buildStoryEditorInspectorActions(
  input: StoryEditorInspectorActionsInput,
): StoryEditorInspectorActions {
  return {
    ...input.commentActions,
    ...input.entityActions,
    setCommentsOpen: input.setCommentsOpen,
    closeInspector: input.closeInspector,
    deleteCommentThread: input.deleteCommentThread,
    restoreCommentThread: input.restoreCommentThread,
    focusCommentThread: input.focusCommentThread,
    deleteGraphElement: input.deleteGraphElement,
    deleteSelectedTrigger: input.deleteSelectedTrigger,
    remove: input.remove,
    createEditorGroup: input.createEditorGroup,
    updateGraphDecoration: input.updateGraphDecoration,
    selectExclusive: input.selectExclusive,
    reportStepComplete: input.reportStepComplete,
    ...buildStoryEditorPersistenceInspectorActions(input.persistence),
  };
}

function buildStoryEditorPersistenceInspectorActions(
  persistence: ReturnType<typeof useStoryEditorPersistence>,
): Pick<
  StoryEditorInspectorActions,
  | 'createStatDefinition'
  | 'updateStatDefinition'
  | 'setStory'
  | 'updateLocation'
  | 'moveItemInstance'
  | 'updateCharacter'
  | 'createCharacterStat'
  | 'updateCharacterStat'
  | 'deleteCharacterStat'
  | 'createCharacterItem'
  | 'deleteCharacterItem'
  | 'updateItemDefinition'
  | 'patchInteraction'
  | 'saveTrigger'
> {
  return {
    createStatDefinition: persistence.createStatDefinition,
    updateStatDefinition: persistence.updateStatDefinition,
    setStory: persistence.setStory,
    updateLocation: persistence.updateLocation,
    moveItemInstance: persistence.moveItemInstance,
    updateCharacter: persistence.updateCharacter,
    createCharacterStat: persistence.createCharacterStat,
    updateCharacterStat: persistence.updateCharacterStat,
    deleteCharacterStat: persistence.deleteCharacterStat,
    createCharacterItem: persistence.createCharacterItem,
    deleteCharacterItem: persistence.deleteCharacterItem,
    updateItemDefinition: persistence.updateItemDefinition,
    patchInteraction: persistence.patchInteraction,
    saveTrigger: persistence.saveTrigger,
  };
}

type StoryEditorInspectorModelInput = {
  story: Story;
  storyId: string;
  t: StoryEditorTranslate;
  reviewOnly: boolean;
  commentsOpen: boolean;
  hasInspectorSelection: boolean;
  selection: StoryEditorSelectionModel;
  comments: ReturnType<typeof useStoryComments>;
  commentProjection: ReturnType<typeof useStoryEditorCommentProjection>;
  commentSummary: ReturnType<typeof useStoryEditorCommentSummary>;
  canManageCommentThread: (thread: StoryCommentThread) => boolean;
  canDeleteCommentThread: (thread: StoryCommentThread) => boolean;
  categories: Pick<
    ReturnType<typeof useStoryContextNavigation>,
    'statCategories' | 'locationCategories' | 'characterCategories' | 'itemCategories'
  >;
  actions: StoryEditorInspectorActions;
};

function buildStoryEditorInspectorModel(
  input: StoryEditorInspectorModelInput,
): StoryEditorInspectorModel {
  return {
    story: input.story,
    storyId: input.storyId,
    t: input.t,
    reviewOnly: input.reviewOnly,
    commentsOpen: input.commentsOpen,
    hasInspectorSelection: input.hasInspectorSelection,
    selection: input.selection,
    comments: input.comments,
    projectedCommentThreads: input.commentProjection.projectedCommentThreads,
    selectedTargetThreads: input.commentProjection.selectedTargetThreads,
    contextualDraftAnchor: input.commentProjection.contextualDraftAnchor,
    canManageCommentThread: input.canManageCommentThread,
    canDeleteCommentThread: input.canDeleteCommentThread,
    statCategories: input.categories.statCategories,
    locationCategories: input.categories.locationCategories,
    characterCategories: input.categories.characterCategories,
    itemCategories: input.categories.itemCategories,
    commentSummary: {
      showContextualComments: input.commentSummary.showContextualComments,
      selectedTargetCommentCount: input.commentSummary.selectedTargetCommentCount,
      selectedTextCommentCounts: input.commentSummary.selectedTextCommentCounts,
      selectedSemanticCommentCounts: input.commentSummary.selectedSemanticCommentCounts,
    },
    actions: input.actions,
  };
}

function StoryEditorInspector({ model }: { model: StoryEditorInspectorModel }) {
  return (
    <>
      <StoryContextualCommentsPanel model={model} />
      {model.commentsOpen ? (
        <StoryCommentsInspector model={model} />
      ) : model.hasInspectorSelection ? (
        <StoryInspectorPanel model={model} />
      ) : null}
    </>
  );
}

function StoryContextualCommentsPanel({ model }: { model: StoryEditorInspectorModel }) {
  if (!model.commentSummary.showContextualComments) {
    return null;
  }
  return (
    <ContextualCommentsRail
      threads={model.selectedTargetThreads}
      selectedThreadId={model.comments.selectedThreadId}
      draftAnchor={model.contextualDraftAnchor}
      error={model.comments.error}
      canComment={model.story.capabilities?.canComment === true}
      canManageThread={model.canManageCommentThread}
      canDeleteThread={model.canDeleteCommentThread}
      onSelect={model.comments.selectThread}
      onCreate={model.comments.create}
      onCancelDraft={model.comments.cancelDraft}
      onReply={model.comments.reply}
      onStatus={model.comments.setStatus}
      onDelete={model.actions.deleteCommentThread}
      onReattach={model.actions.reattachSelectedThread}
      onClose={model.actions.closeContextualComments}
    />
  );
}

function StoryCommentsInspector({ model }: { model: StoryEditorInspectorModel }) {
  return (
    <div className="inspector comments-inspector" data-testid="comments-inspector">
      <StoryCommentsPanel
        open
        placement="inspector"
        loading={model.comments.loading}
        error={model.comments.error}
        threads={model.projectedCommentThreads}
        selectedThread={model.comments.selectedThread}
        canComment={model.story.capabilities?.canComment === true}
        canManageThread={Boolean(
          model.comments.selectedThread &&
          model.canManageCommentThread(model.comments.selectedThread),
        )}
        canDeleteThread={Boolean(
          model.comments.selectedThread &&
          model.canDeleteCommentThread(model.comments.selectedThread),
        )}
        deletedLoading={model.comments.deletedLoading}
        realtimeStatus={model.comments.realtimeStatus}
        onClose={() => model.actions.setCommentsOpen(false)}
        onSelect={(threadId) => selectCommentInspectorThread(model, threadId)}
        onCancelDraft={model.comments.cancelDraft}
        onCreate={model.comments.create}
        onReply={model.comments.reply}
        onStatus={model.comments.setStatus}
        onDelete={model.actions.deleteCommentThread}
        onRestore={model.actions.restoreCommentThread}
        onLoadDeleted={model.comments.loadDeleted}
      />
    </div>
  );
}

function selectCommentInspectorThread(
  model: StoryEditorInspectorModel,
  threadId: string | undefined,
) {
  if (!threadId) {
    model.comments.selectThread(undefined);
    return;
  }
  const thread = model.projectedCommentThreads.find(({ id }) => id === threadId);
  if (thread?.deletedAt) {
    model.comments.selectThread(threadId);
  } else {
    model.actions.focusCommentThread(threadId);
  }
}

function StoryInspectorPanel({ model }: { model: StoryEditorInspectorModel }) {
  const { selection } = model;
  return (
    <aside
      className="inspector"
      data-onboarding-target={
        selection.selected && !model.reviewOnly ? 'scene-inspector' : undefined
      }
      aria-label={model.t('editor.inspector')}
    >
      <StoryInspectorHeader model={model} />
      <div className="inspector-content">
        <StoryInspectorContent model={model} />
      </div>
    </aside>
  );
}

function StoryInspectorHeader({ model }: { model: StoryEditorInspectorModel }) {
  return (
    <div className="inspector-header">
      {model.selection.selectedCommentTarget && model.story.capabilities?.canComment ? (
        <StoryInspectorCommentActions model={model} />
      ) : null}
      <button
        className="ghost inspector-close"
        type="button"
        aria-label={model.t('editor.closeInspector')}
        onClick={model.actions.closeInspector}
      >
        x
      </button>
    </div>
  );
}

function StoryInspectorCommentActions({ model }: { model: StoryEditorInspectorModel }) {
  const { t } = model;
  const { showContextualComments, selectedTargetCommentCount } = model.commentSummary;
  const commentLabel = showContextualComments
    ? 'comments.collapseForEntity'
    : selectedTargetCommentCount > 0
      ? 'comments.openForEntity'
      : 'comments.commentEntity';
  return (
    <div className="inspector-comment-actions">
      <button
        className={`secondary inspector-comment-toggle ${showContextualComments ? 'active' : ''}`}
        type="button"
        aria-expanded={showContextualComments}
        aria-label={t(commentLabel)}
        title={t(commentLabel)}
        onClick={model.actions.toggleContextualComments}
      >
        <span aria-hidden="true">◆</span>
        <small>{selectedTargetCommentCount || '+'}</small>
      </button>
      {selectedTargetCommentCount > 0 ? (
        <button
          className="secondary inspector-comment-add"
          type="button"
          aria-label={t('comments.commentEntity')}
          title={t('comments.commentEntity')}
          onClick={model.actions.startEntityComment}
        >
          <span aria-hidden="true">+</span>
        </button>
      ) : null}
      <button
        className="ghost"
        type="button"
        title={t('comments.selectTextHelp')}
        aria-label={t('comments.selectTextHelp')}
        onMouseDown={(event) => {
          event.preventDefault();
          model.actions.startTextComment();
        }}
      >
        <span aria-hidden="true">✎</span>
      </button>
    </div>
  );
}

function StoryInspectorContent({ model }: { model: StoryEditorInspectorModel }) {
  const { selection } = model;
  if (selection.graphSelection) {
    return <StoryGraphSelectionContent model={model} />;
  }
  if (selection.selectedGraphDecoration) {
    return <StoryGraphDecorationContent model={model} />;
  }
  if (
    !model.reviewOnly &&
    (selection.isCreatingStatDefinition || selection.selectedStatDefinition)
  ) {
    return <StoryStatDefinitionContent model={model} />;
  }
  if (model.reviewOnly) {
    return <StoryReviewContent model={model} />;
  }
  if (selection.selected) {
    return <StoryInteractionContent model={model} />;
  }
  if (selection.selectedTriggerTarget) {
    return <StoryTriggerContent model={model} />;
  }
  if (hasStoryContextInspectorSelection(selection)) {
    return <StoryContextEntityInspectorContent model={model} />;
  }
  return null;
}

function hasStoryContextInspectorSelection(selection: StoryEditorSelectionModel) {
  return Boolean(
    selection.selectedLocation || selection.selectedCharacter || selection.selectedItemDefinition,
  );
}

function StoryContextEntityInspectorContent({ model }: { model: StoryEditorInspectorModel }) {
  if (model.selection.selectedLocation) {
    return <StoryLocationContent model={model} />;
  }
  if (model.selection.selectedCharacter) {
    return <StoryCharacterContent model={model} />;
  }
  if (model.selection.selectedItemDefinition) {
    return <StoryItemDefinitionContent model={model} />;
  }
  return null;
}

function StoryGraphSelectionContent({ model }: { model: StoryEditorInspectorModel }) {
  const selection = model.selection.graphSelection;
  if (!selection) {
    return null;
  }
  return (
    <StoryGraphSelectionInspector
      selection={selection}
      onCreateGroup={async (title, ids) =>
        Boolean(await model.actions.createEditorGroup(title, ids))
      }
    />
  );
}

function StoryGraphDecorationContent({ model }: { model: StoryEditorInspectorModel }) {
  const decoration = model.selection.selectedGraphDecoration;
  if (!decoration) {
    return null;
  }
  return (
    <GraphDecorationInspector
      decoration={decoration}
      onPatch={(patch) => void model.actions.updateGraphDecoration(decoration.id, patch)}
      onDelete={() =>
        void model.actions.deleteGraphElement({
          kind: 'graphDecoration',
          decorationId: decoration.id,
        })
      }
    />
  );
}

function StoryStatDefinitionContent({ model }: { model: StoryEditorInspectorModel }) {
  const { selection, actions, story } = model;
  return (
    <StatDefinitionInspector
      categorySuggestions={model.statCategories}
      creating={selection.isCreatingStatDefinition}
      key={selection.selectedStatDefinition?.id ?? 'creating-stat-definition'}
      onChange={actions.updateLocalStatDefinition}
      onClose={actions.closeInspector}
      onCreate={async (input) => createStoryStatDefinition(model, input)}
      onPatch={actions.updateStatDefinition}
      onStory={actions.setStory}
      statDefinition={selection.selectedStatDefinition}
      story={story}
      textCommentCounts={model.commentSummary.selectedTextCommentCounts}
      onOpenTextComments={actions.openTextComments}
      semanticCommentCounts={model.commentSummary.selectedSemanticCommentCounts}
      onOpenSemanticComments={actions.openSemanticComments}
    />
  );
}

async function createStoryStatDefinition(
  model: StoryEditorInspectorModel,
  input: Parameters<StoryEditorInspectorActions['createStatDefinition']>[0],
) {
  const definitionId = await model.actions.createStatDefinition(input);
  if (definitionId) {
    model.actions.selectExclusive({ type: 'statDefinition', id: definitionId });
  }
  return definitionId;
}

function StoryReviewContent({ model }: { model: StoryEditorInspectorModel }) {
  const { selection, commentSummary, actions } = model;
  return (
    <ReviewTargetInspector
      interaction={selection.selected}
      trigger={selection.selectedTriggerTarget?.trigger}
      location={selection.selectedLocation}
      character={selection.selectedCharacter}
      statDefinition={selection.selectedStatDefinition}
      itemDefinition={selection.selectedItemDefinition}
      textCommentCounts={commentSummary.selectedTextCommentCounts}
      onOpenTextComments={actions.openTextComments}
    />
  );
}

function StoryInteractionContent({ model }: { model: StoryEditorInspectorModel }) {
  const interaction = model.selection.selected;
  if (!interaction) {
    return null;
  }
  const { actions, commentSummary } = model;
  return (
    <InteractionInspector
      story={model.story}
      interaction={interaction}
      onChange={actions.setStory}
      onPatch={actions.patchInteraction}
      onContentSaved={(body) => {
        if (body.replace(/<[^>]*>/g, ' ').trim()) {
          actions.reportStepComplete(model.storyId, 'write-scene');
        }
      }}
      onDelete={actions.remove}
      onSelectInteraction={(interactionId) =>
        actions.selectExclusive({ type: 'interaction', id: interactionId })
      }
      textCommentCounts={commentSummary.selectedTextCommentCounts}
      onOpenTextComments={actions.openTextComments}
      semanticCommentCounts={commentSummary.selectedSemanticCommentCounts}
      onOpenSemanticComments={actions.openSemanticComments}
    />
  );
}

function StoryTriggerContent({ model }: { model: StoryEditorInspectorModel }) {
  const target = model.selection.selectedTriggerTarget;
  if (!target) {
    return null;
  }
  return (
    <Suspense
      fallback={
        <p className="hint" role="status">
          {model.t('shell.loading')}
        </p>
      }
    >
      <TriggerInspector
        story={model.story}
        interaction={target.interaction}
        trigger={target.trigger}
        onSaveTrigger={model.actions.saveTrigger}
        onDeleteTrigger={model.actions.deleteSelectedTrigger}
        semanticCommentCounts={model.commentSummary.selectedSemanticCommentCounts}
        onOpenSemanticComments={model.actions.openSemanticComments}
      />
    </Suspense>
  );
}

function StoryLocationContent({ model }: { model: StoryEditorInspectorModel }) {
  const location = model.selection.selectedLocation;
  if (!location) {
    return null;
  }
  return (
    <LocationInspector
      location={location}
      categorySuggestions={model.locationCategories}
      onLocalChange={model.actions.updateLocalLocation}
      onPatch={model.actions.updateLocation}
      itemDefinitions={model.story.itemDefinitions ?? []}
      statDefinitions={model.story.statDefinitions ?? []}
      onMoveItem={model.actions.moveItemInstance}
      textCommentCounts={model.commentSummary.selectedTextCommentCounts}
      onOpenTextComments={model.actions.openTextComments}
      semanticCommentCounts={model.commentSummary.selectedSemanticCommentCounts}
      onOpenSemanticComments={model.actions.openSemanticComments}
    />
  );
}

function StoryCharacterContent({ model }: { model: StoryEditorInspectorModel }) {
  const character = model.selection.selectedCharacter;
  if (!character) {
    return null;
  }
  const { actions, story, commentSummary } = model;
  return (
    <CharacterInspector
      character={character}
      categorySuggestions={model.characterCategories}
      statDefinitions={story.statDefinitions ?? []}
      itemDefinitions={story.itemDefinitions ?? []}
      onChange={actions.updateLocalCharacter}
      onPatch={actions.updateCharacter}
      onCreateStat={actions.createCharacterStat}
      onPatchStat={actions.updateCharacterStat}
      onDeleteStat={actions.deleteCharacterStat}
      onCreateItem={actions.createCharacterItem}
      onDeleteItem={actions.deleteCharacterItem}
      onMoveItem={actions.moveItemInstance}
      textCommentCounts={commentSummary.selectedTextCommentCounts}
      onOpenTextComments={actions.openTextComments}
      semanticCommentCounts={commentSummary.selectedSemanticCommentCounts}
      onOpenSemanticComments={actions.openSemanticComments}
    />
  );
}

function StoryItemDefinitionContent({ model }: { model: StoryEditorInspectorModel }) {
  const itemDefinition = model.selection.selectedItemDefinition;
  if (!itemDefinition) {
    return null;
  }
  return (
    <ItemDefinitionInspector
      itemDefinition={itemDefinition}
      categorySuggestions={model.itemCategories}
      statDefinitions={model.story.statDefinitions ?? []}
      onChange={model.actions.updateLocalItemDefinition}
      onPatch={model.actions.updateItemDefinition}
      textCommentCounts={model.commentSummary.selectedTextCommentCounts}
      onOpenTextComments={model.actions.openTextComments}
      semanticCommentCounts={model.commentSummary.selectedSemanticCommentCounts}
      onOpenSemanticComments={model.actions.openSemanticComments}
    />
  );
}

type StoryEditorSelectionModel = ReturnType<typeof useStoryEditorSelection>;
type StoryContextNavigationModel = ReturnType<typeof useStoryContextNavigation>;
type StoryGroupActions = {
  create: (title: string, ids: string[], parentGroupId?: string) => Promise<string | false>;
  editingGroupId: string | undefined;
  setEditingGroupId: Dispatch<SetStateAction<string | undefined>>;
  update: ReturnType<typeof useStoryEditorPersistence>['updateGroup'];
  delete: ReturnType<typeof useStoryEditorPersistence>['deleteGroup'];
};

type StoryContextPanelProps = {
  story: Story;
  navigation: StoryContextNavigationModel;
  selection: StoryEditorSelectionModel;
  reviewOnly: boolean;
  commentCounts: ReadonlyMap<string, number>;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  selectInteraction: (interactionId: string) => void;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  openCommentsForTarget: (targetType: CommentTargetType, targetId: string) => void;
  flowInstanceRef: { current: ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null };
  groupActions: StoryGroupActions;
  entityActions: ReturnType<typeof useStoryEditorEntityActions>;
  t: StoryEditorTranslate;
};

function StoryContextPanel(props: StoryContextPanelProps) {
  const { navigation, t } = props;
  const open = navigation.isContextPanelOpen;
  return (
    <nav className={`location-panel ${open ? '' : 'collapsed'}`} aria-label={t('editor.context')}>
      <button
        className="ghost navigation-toggle"
        type="button"
        aria-label={t(open ? 'editor.collapseContext' : 'editor.expandContext')}
        aria-expanded={open}
        aria-controls="story-context-panel-content"
        onClick={navigation.toggleContextPanel}
      >
        {open ? '‹' : '›'}
      </button>
      {open ? <StoryContextPanelContent {...props} /> : null}
    </nav>
  );
}

function StoryContextPanelContent(props: StoryContextPanelProps) {
  return (
    <div className="location-panel-content" id="story-context-panel-content">
      <StoryContextSearch navigation={props.navigation} t={props.t} />
      <StoryContextEntitySectionsTop {...props} />
      <StoryContextEntitySectionsBottom {...props} />
      <StoryContextGroupsSection {...props} />
    </div>
  );
}

function StoryContextSearch({ navigation, t }: Pick<StoryContextPanelProps, 'navigation' | 't'>) {
  const count = navigation.navigationInteractionIds.length;
  const position = count === 0 ? '0 / 0' : `${navigation.currentNavigationIndex + 1} / ${count}`;
  return (
    <div className="context-search">
      <input
        type="search"
        aria-label={t('editor.search')}
        placeholder={t('editor.searchPlaceholder')}
        value={navigation.searchQuery}
        onChange={(event) => navigation.setSearchQuery(event.target.value)}
      />
      <button
        className="ghost"
        type="button"
        aria-label={t('editor.previousResult')}
        title={t('editor.previousResult')}
        disabled={count === 0}
        onClick={() => navigation.navigateInteractions(-1)}
      >
        ↑
      </button>
      <button
        className="ghost"
        type="button"
        aria-label={t('editor.nextResult')}
        title={t('editor.nextResult')}
        disabled={count === 0}
        onClick={() => navigation.navigateInteractions(1)}
      >
        ↓
      </button>
      <span className="context-search-count" aria-live="polite">
        {position}
      </span>
    </div>
  );
}

function StoryContextEntitySectionsTop(props: StoryContextPanelProps) {
  const { navigation, selection, story, reviewOnly, commentCounts } = props;
  return (
    <>
      <StatDefinitionContextSection
        items={navigation.filteredStatDefinitions}
        searchQuery={navigation.searchQuery}
        count={story.statDefinitions?.length ?? 0}
        open={navigation.openContextSections.stats}
        selectedId={selection.selectedStatDefinitionId}
        referenceCounts={navigation.contextReferenceCounts.stats}
        commentCounts={commentCounts}
        onToggle={() => navigation.toggleContextSection('stats')}
        onAdd={!reviewOnly ? props.entityActions.addStatDefinition : undefined}
        onSelect={(id) => selectContextEntity(props, { type: 'statDefinition', id })}
        onOpenComments={(id) => props.openCommentsForTarget('statDefinition', id)}
      />
      <ItemDefinitionContextSection
        items={navigation.filteredItemDefinitions}
        searchQuery={navigation.searchQuery}
        count={story.itemDefinitions?.length ?? 0}
        open={navigation.openContextSections.items}
        selectedId={selection.selectedItemDefinitionId}
        referenceCounts={navigation.contextReferenceCounts.items}
        commentCounts={commentCounts}
        onToggle={() => navigation.toggleContextSection('items')}
        onAdd={!reviewOnly ? () => void props.entityActions.addItemDefinition() : undefined}
        onSelect={(id) => selectContextEntity(props, { type: 'itemDefinition', id })}
        onOpenComments={(id) => props.openCommentsForTarget('itemDefinition', id)}
      />
    </>
  );
}

function StoryContextEntitySectionsBottom(props: StoryContextPanelProps) {
  const { navigation, selection, story, reviewOnly, commentCounts } = props;
  return (
    <>
      <CharacterContextSection
        items={navigation.filteredCharacters}
        searchQuery={navigation.searchQuery}
        count={story.characters?.length ?? 0}
        open={navigation.openContextSections.characters}
        selectedId={selection.selectedCharacterId}
        referenceCounts={navigation.contextReferenceCounts.characters}
        commentCounts={commentCounts}
        onToggle={() => navigation.toggleContextSection('characters')}
        onAdd={!reviewOnly ? () => void props.entityActions.addCharacter() : undefined}
        onSelect={(id) => selectContextEntity(props, { type: 'character', id })}
        onOpenComments={(id) => props.openCommentsForTarget('character', id)}
      />
      <LocationContextSection
        items={navigation.filteredLocations}
        searchQuery={navigation.searchQuery}
        count={story.locations?.length ?? 0}
        open={navigation.openContextSections.locations}
        selectedId={selection.selectedLocationId}
        referenceCounts={navigation.contextReferenceCounts.locations}
        commentCounts={commentCounts}
        onToggle={() => navigation.toggleContextSection('locations')}
        onAdd={!reviewOnly ? () => void props.entityActions.addLocation() : undefined}
        onSelect={(id) => selectContextEntity(props, { type: 'location', id })}
        onOpenComments={(id) => props.openCommentsForTarget('location', id)}
      />
    </>
  );
}

function selectContextEntity(
  props: Pick<StoryContextPanelProps, 'navigation' | 'selectExclusive' | 'setCommentsOpen'>,
  selection: StoryEditorExclusiveSelection,
) {
  props.navigation.clearSearch();
  props.setCommentsOpen(false);
  props.selectExclusive(selection);
}

function StoryContextGroupsSection(props: StoryContextPanelProps) {
  const { navigation, selection, story, reviewOnly, groupActions, t } = props;
  const selectionIds =
    selection.graphSelection?.interactionIds ??
    (selection.selectedId ? [selection.selectedId] : []);
  return (
    <StoryGroupsPanel
      key={story.id}
      story={story}
      searchQuery={navigation.searchQuery}
      matchingInteractionIds={navigation.matchingInteractionIds}
      open={navigation.openContextSections.groups}
      onToggle={() => navigation.toggleContextSection('groups')}
      onAdd={() => void groupActions.create(t('editor.groups.newGroup'), [])}
      selectedGroupId={selection.selectedGroupId}
      selectedInteractionId={selection.selectedId}
      editingGroupId={groupActions.editingGroupId}
      onEditingChange={groupActions.setEditingGroupId}
      onCreate={groupActions.create}
      onSelectInteractions={selection.selectGraphInteractions}
      selectionIds={selectionIds}
      readOnly={reviewOnly}
      onSelect={(id) => selectContextEntity(props, { type: 'group', id })}
      onSelectInteraction={props.selectInteraction}
      onFocus={(ids) => {
        void props.flowInstanceRef.current?.fitView({
          nodes: ids.map((id) => ({ id })),
          padding: 0.3,
          maxZoom: 1,
          duration: 250,
        });
      }}
      onUpdate={groupActions.update}
      onDelete={groupActions.delete}
    />
  );
}

type StoryEditorEntityActionInput = {
  story: Story | undefined;
  selectedCharacter: Character | undefined;
  setStory: (story: Story) => void;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  openContextPanel: () => void;
  openContextSection: ReturnType<typeof useStoryContextNavigation>['openContextSection'];
} & Pick<
  ReturnType<typeof useStoryEditorPersistence>,
  'createLocation' | 'createCharacter' | 'createStatDefinition' | 'createItemDefinition'
>;

async function addStoryLocation(input: StoryEditorEntityActionInput) {
  const locationId = await input.createLocation();
  if (!locationId) {
    return;
  }
  input.selectExclusive({ type: 'location', id: locationId });
  input.openContextPanel();
  input.openContextSection('locations');
}

function updateStoryLocation(input: StoryEditorEntityActionInput, nextLocation: Location) {
  if (!input.story) {
    return;
  }
  input.setStory({
    ...input.story,
    locations: (input.story.locations ?? []).map((location) =>
      location.id === nextLocation.id ? nextLocation : location,
    ),
  });
}

async function addStoryCharacter(input: StoryEditorEntityActionInput) {
  const characterId = await input.createCharacter();
  if (!characterId) {
    return;
  }
  input.selectExclusive({ type: 'character', id: characterId });
  input.openContextPanel();
  input.openContextSection('characters');
}

function addStoryStatDefinition(input: StoryEditorEntityActionInput) {
  input.selectExclusive({ type: 'statDefinitionCreation' });
  input.openContextPanel();
  input.openContextSection('stats');
}

function updateStoryStatDefinition(
  input: StoryEditorEntityActionInput,
  nextDefinition: StatDefinition,
) {
  if (!input.story) {
    return;
  }
  input.setStory({
    ...input.story,
    statDefinitions: (input.story.statDefinitions ?? []).map((definition) =>
      definition.id === nextDefinition.id ? nextDefinition : definition,
    ),
  });
}

async function addStoryItemDefinition(input: StoryEditorEntityActionInput) {
  const itemDefinitionId = await input.createItemDefinition();
  if (!itemDefinitionId) {
    return;
  }
  input.selectExclusive({ type: 'itemDefinition', id: itemDefinitionId });
  input.openContextPanel();
  input.openContextSection('items');
}

function updateStoryItemDefinition(
  input: StoryEditorEntityActionInput,
  nextDefinition: ItemDefinition,
) {
  if (!input.story) {
    return;
  }
  input.setStory({
    ...input.story,
    itemDefinitions: (input.story.itemDefinitions ?? []).map((definition) =>
      definition.id === nextDefinition.id ? nextDefinition : definition,
    ),
  });
}

function updateStoryCharacter(input: StoryEditorEntityActionInput, patch: Partial<Character>) {
  if (!input.story || !input.selectedCharacter) {
    return;
  }
  input.setStory({
    ...input.story,
    characters: (input.story.characters ?? []).map((character) =>
      character.id === input.selectedCharacter?.id ? { ...character, ...patch } : character,
    ),
  });
}

function useStoryEditorEntityActions(input: StoryEditorEntityActionInput) {
  return {
    addLocation: () => addStoryLocation(input),
    updateLocalLocation: (location: Location) => updateStoryLocation(input, location),
    addCharacter: () => addStoryCharacter(input),
    addStatDefinition: () => addStoryStatDefinition(input),
    updateLocalStatDefinition: (definition: StatDefinition) =>
      updateStoryStatDefinition(input, definition),
    addItemDefinition: () => addStoryItemDefinition(input),
    updateLocalItemDefinition: (definition: ItemDefinition) =>
      updateStoryItemDefinition(input, definition),
    updateLocalCharacter: (patch: Partial<Character>) => updateStoryCharacter(input, patch),
  };
}

type StoryGraphContextTarget =
  | { kind: 'canvas' }
  | { kind: 'interaction'; interactionId: string }
  | { kind: 'trigger'; interactionId: string; triggerId: string }
  | { kind: 'graphDecoration'; decorationId: string };

type StoryGraphElementContextTarget = Exclude<StoryGraphContextTarget, { kind: 'canvas' }>;
type StoryEditorTranslate = ReturnType<typeof useTranslation>['t'];

interface CanvasContextMenuState {
  screenPosition: Position;
  flowPosition: Position;
  target: StoryGraphContextTarget;
}

type IdleCallbackWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type CommentThreadFocus = {
  selection?: StoryEditorExclusiveSelection;
  graphNodeIds: string[];
  clearSelection: boolean;
};

function commentTargetKey(anchor: StoryCommentThread['anchor']) {
  return anchor.kind === 'canvas' ? undefined : anchor.targetType + ':' + anchor.targetId;
}

function resolveCommentThreadFocus(
  thread: StoryCommentThread,
  story: Story | undefined,
): CommentThreadFocus {
  const anchor = thread.anchor;
  if (anchor.kind === 'canvas') {
    return { graphNodeIds: ['comment:' + thread.id], clearSelection: true };
  }
  if (anchor.targetType === 'trigger') {
    return resolveTriggerCommentFocus(anchor.targetId, story);
  }

  const selection = selectionForCommentTarget(anchor.targetType, anchor.targetId);
  const referenceType = referenceTypeForCommentTarget(anchor.targetType);
  const graphNodeIds = referenceType
    ? getReferencedInteractionIds(story, { type: referenceType, id: anchor.targetId })
    : [anchor.targetId];
  return { selection, graphNodeIds, clearSelection: false };
}

function resolveTriggerCommentFocus(
  triggerId: string,
  story: Story | undefined,
): CommentThreadFocus {
  const owner = story?.interactions.find((interaction) =>
    interaction.triggers.some(({ id }) => id === triggerId),
  );
  if (!owner) {
    return { graphNodeIds: [], clearSelection: true };
  }
  return {
    selection: { type: 'trigger', trigger: { interactionId: owner.id, triggerId } },
    graphNodeIds: [owner.id],
    clearSelection: false,
  };
}

function selectionForCommentTarget(
  targetType: Exclude<CommentTargetType, 'trigger'>,
  targetId: string,
): StoryEditorExclusiveSelection {
  switch (targetType) {
    case 'interaction':
      return { type: 'interaction', id: targetId };
    case 'location':
      return { type: 'location', id: targetId };
    case 'character':
      return { type: 'character', id: targetId };
    case 'statDefinition':
      return { type: 'statDefinition', id: targetId };
    case 'itemDefinition':
      return { type: 'itemDefinition', id: targetId };
  }
}

function referenceTypeForCommentTarget(
  targetType: Exclude<CommentTargetType, 'trigger'>,
): StoryContextReference['type'] | undefined {
  switch (targetType) {
    case 'interaction':
      return undefined;
    case 'location':
      return 'location';
    case 'character':
      return 'character';
    case 'statDefinition':
      return 'stat';
    case 'itemDefinition':
      return 'item';
  }
}

function focusGraphNodes(
  nodeIds: string[],
  getFlowInstance: () => ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null,
) {
  if (nodeIds.length === 0) {
    return;
  }
  window.requestAnimationFrame(() => {
    void getFlowInstance()?.fitView({
      nodes: nodeIds.map((id) => ({ id })),
      duration: 250,
      padding: 0.7,
      maxZoom: 1,
    });
  });
}

type HistoryShortcutAction = 'undo' | 'redo';

function historyShortcutAction(
  event: KeyboardEvent,
  state: {
    saveStatus: string;
    historyBusy: boolean;
    canUndo: boolean;
    canRedo: boolean;
  },
): HistoryShortcutAction | undefined {
  if (!hasHistoryShortcutModifiers(event) || isRealtimeEditableTarget(event.target)) {
    return undefined;
  }
  const action = historyActionForKey(event);
  if (!action || !canRunHistoryAction(action, state)) {
    return undefined;
  }
  return action;
}

function hasHistoryShortcutModifiers(event: KeyboardEvent) {
  return (event.ctrlKey || event.metaKey) && !event.altKey;
}

function historyActionForKey(event: KeyboardEvent): HistoryShortcutAction | undefined {
  const key = event.key.toLowerCase();
  if (key === 'y' || (key === 'z' && event.shiftKey)) {
    return 'redo';
  }
  return key === 'z' ? 'undo' : undefined;
}

function canRunHistoryAction(
  action: HistoryShortcutAction,
  state: { saveStatus: string; historyBusy: boolean; canUndo: boolean; canRedo: boolean },
) {
  if (state.saveStatus === 'saving' || state.saveStatus === 'error' || state.historyBusy) {
    return false;
  }
  return action === 'undo' ? state.canUndo : state.canRedo;
}

function isGroupShortcut(event: KeyboardEvent, reviewOnly: boolean) {
  return (
    !reviewOnly &&
    !isRealtimeEditableTarget(event.target) &&
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === 'g'
  );
}

type StoryNodeSelectEvent = Parameters<NodeMouseHandler<StoryFlowNode>>[0];
type GraphSelectionHandler = (
  interactionIds: string[],
  triggers?: StoryGraphSelection['triggers'],
) => void;

type StoryNodeSelectionInput = {
  event: StoryNodeSelectEvent;
  node: StoryFlowNode;
  reviewOnly: boolean;
  graphSelection: StoryGraphSelection | undefined;
  selectedId: string | undefined;
  selectedGraphNodeIds: ReadonlySet<string>;
  selectGraphInteractions: GraphSelectionHandler;
  setCanvasContextMenu: (state: CanvasContextMenuState | undefined) => void;
  setCommentsOpen: (open: boolean) => void;
  selectCommentThread: (threadId?: string) => void;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
};

function buildSemanticCommentAnchor(
  target: { targetType: CommentTargetType; targetId: string },
  slot: CommentSemanticSlot,
): CommentAnchor | undefined {
  const anchor =
    slot.kind === 'field'
      ? { kind: 'field', ...target, field: slot.field }
      : { kind: 'section', ...target, section: slot.section };
  return isCommentAnchor(anchor) ? anchor : undefined;
}

type SelectedCommentTarget = { targetType: CommentTargetType; targetId: string } | undefined;

function projectCommentThreads(story: Story | undefined, threads: StoryCommentThread[]) {
  return story
    ? threads.map((thread) => ({
        ...thread,
        detached: isCommentAnchorDetached(story, thread.anchor),
      }))
    : threads;
}

function selectTargetCommentThreads(threads: StoryCommentThread[], target: SelectedCommentTarget) {
  return target
    ? threads.filter(
        (thread) =>
          thread.anchor.kind !== 'canvas' &&
          thread.anchor.targetType === target.targetType &&
          thread.anchor.targetId === target.targetId,
      )
    : [];
}

function findContextualDraftAnchor(
  draft: CommentAnchor | undefined,
  target: SelectedCommentTarget,
): Exclude<CommentAnchor, { kind: 'canvas' }> | undefined {
  if (!draft || draft.kind === 'canvas' || !target) {
    return undefined;
  }
  return draft.targetType === target.targetType && draft.targetId === target.targetId
    ? draft
    : undefined;
}

function countStoryComments(threads: StoryCommentThread[]) {
  const graph = new Map<string, number>();
  const byTarget = new Map<string, number>();
  for (const thread of threads) {
    if (thread.status !== 'open' || thread.anchor.kind === 'canvas') {
      continue;
    }
    incrementCommentCount(byTarget, `${thread.anchor.targetType}:${thread.anchor.targetId}`);
    if (thread.anchor.targetType === 'interaction' || thread.anchor.targetType === 'trigger') {
      incrementCommentCount(graph, thread.anchor.targetId);
    }
  }
  return { graphCommentCounts: graph, commentCountsByTarget: byTarget };
}

function incrementCommentCount(counts: Map<string, number>, key: string) {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function countTextComments(threads: StoryCommentThread[]) {
  return threads.reduce<Partial<Record<CommentTextField, number>>>((counts, thread) => {
    if (thread.status === 'open' && thread.anchor.kind === 'text') {
      counts[thread.anchor.field] = (counts[thread.anchor.field] ?? 0) + 1;
    }
    return counts;
  }, {});
}

function countSemanticComments(threads: StoryCommentThread[]) {
  return threads.reduce<Partial<Record<string, number>>>((counts, thread) => {
    if (thread.status === 'open' && isSemanticCommentAnchor(thread.anchor)) {
      const key = commentSemanticSlotKey(thread.anchor);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, {});
}

function isSemanticCommentAnchor(
  anchor: CommentAnchor,
): anchor is Extract<CommentAnchor, { kind: 'field' | 'section' }> {
  return anchor.kind === 'field' || anchor.kind === 'section';
}

function useStoryEditorCommentProjection(input: {
  story: Story | undefined;
  commentThreads: StoryCommentThread[];
  selectedCommentTarget: SelectedCommentTarget;
  draftAnchor: CommentAnchor | undefined;
}) {
  const projectedCommentThreads = useMemo(
    () => projectCommentThreads(input.story, input.commentThreads),
    [input.commentThreads, input.story],
  );
  const activeCommentThreads = useMemo(
    () => projectedCommentThreads.filter((thread) => !thread.deletedAt),
    [projectedCommentThreads],
  );
  const selectedTargetThreads = useMemo(
    () => selectTargetCommentThreads(activeCommentThreads, input.selectedCommentTarget),
    [activeCommentThreads, input.selectedCommentTarget],
  );
  const contextualDraftAnchor = useMemo(
    () => findContextualDraftAnchor(input.draftAnchor, input.selectedCommentTarget),
    [input.draftAnchor, input.selectedCommentTarget],
  );
  const counts = useMemo(() => countStoryComments(activeCommentThreads), [activeCommentThreads]);
  return {
    projectedCommentThreads,
    activeCommentThreads,
    selectedTargetThreads,
    contextualDraftAnchor,
    counts,
  };
}

function useStoryEditorCommentSummary(input: {
  commentsOpen: boolean;
  contextualCommentsTargetKey: string | undefined;
  hasInspectorSelection: boolean;
  selectedCommentTarget: SelectedCommentTarget;
  selectedTargetThreads: StoryCommentThread[];
  contextualDraftAnchor: Exclude<CommentAnchor, { kind: 'canvas' }> | undefined;
  counts: ReturnType<typeof countStoryComments>;
}) {
  const selectedTextCommentCounts = useMemo(
    () => countTextComments(input.selectedTargetThreads),
    [input.selectedTargetThreads],
  );
  const selectedSemanticCommentCounts = useMemo(
    () => countSemanticComments(input.selectedTargetThreads),
    [input.selectedTargetThreads],
  );
  const selectedCommentTargetKey = input.selectedCommentTarget
    ? `${input.selectedCommentTarget.targetType}:${input.selectedCommentTarget.targetId}`
    : undefined;
  const selectedTargetCommentCount = getCommentTargetCount(
    input.counts.commentCountsByTarget,
    selectedCommentTargetKey,
  );
  const showContextualComments = isContextualCommentsOpen(
    input.commentsOpen,
    selectedCommentTargetKey,
    input.contextualCommentsTargetKey,
    input.contextualDraftAnchor,
  );
  return {
    selectedTargetCommentCount,
    selectedTextCommentCounts,
    selectedSemanticCommentCounts,
    selectedCommentTargetKey,
    showContextualComments,
    hasInspector: input.commentsOpen || input.hasInspectorSelection,
  };
}

function getCommentTargetCount(counts: ReadonlyMap<string, number>, key: string | undefined) {
  return key ? (counts.get(key) ?? 0) : 0;
}

function isContextualCommentsOpen(
  commentsOpen: boolean,
  selectedTargetKey: string | undefined,
  contextualTargetKey: string | undefined,
  draftAnchor: Exclude<CommentAnchor, { kind: 'canvas' }> | undefined,
) {
  return Boolean(
    !commentsOpen &&
    selectedTargetKey &&
    (contextualTargetKey === selectedTargetKey || draftAnchor),
  );
}

function selectStoryFlowNode(input: StoryNodeSelectionInput) {
  input.setCanvasContextMenu(undefined);
  if (input.node.type === 'commentPin') {
    return;
  }
  if (toggleGraphNodeSelection(input)) {
    return;
  }

  input.setCommentsOpen(false);
  input.selectCommentThread(undefined);
  if (input.selectedGraphNodeIds.has(input.node.id)) {
    return;
  }
  selectSingleGraphNode(input);
}

type StoryEditorNodeDragInput = {
  story: Story | undefined;
  graphSelection: StoryGraphSelection | undefined;
  selectedGraphNodeIds: ReadonlySet<string>;
  setNodes: ReturnType<typeof useNodesState<StoryFlowNode>>[1];
  setEdges: ReturnType<typeof useEdgesState<TriggerFlowEdge>>[1];
  setElkEdgeRoutes: Dispatch<SetStateAction<TriggerEdgeRoutes>>;
  closeInspector: () => void;
  beginLocalEdit: () => void;
  endLocalEdit: () => void;
  saveGraphPositions: ReturnType<typeof useStoryEditorPersistence>['saveGraphPositions'];
  reanchorComment: ReturnType<typeof useStoryComments>['reanchor'];
};

function getMovedNarrativeNodes(
  input: Pick<StoryEditorNodeDragInput, 'graphSelection' | 'selectedGraphNodeIds'>,
  draggedNode: StoryFlowNode,
  draggedNodes: StoryFlowNode[],
) {
  if (!input.graphSelection || !input.selectedGraphNodeIds.has(draggedNode.id)) {
    return [draggedNode];
  }
  const selectedDraggedNodes = draggedNodes.filter(
    (node) =>
      input.selectedGraphNodeIds.has(node.id) &&
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

function previewStoryNodeMoves(
  input: Pick<StoryEditorNodeDragInput, 'story' | 'setNodes' | 'setEdges'>,
  movedNodes: readonly StoryFlowNode[],
  positionOverrides: ReadonlyMap<string, Position>,
) {
  const directlyMovedTriggerNodeIds = new Set(
    movedNodes.flatMap((node) => (node.type === 'trigger' ? [node.id] : [])),
  );
  input.setNodes((current) =>
    applyInteractionMovesTriggerPreview(
      current,
      input.story,
      positionOverrides,
      directlyMovedTriggerNodeIds,
    ),
  );
  input.setEdges((current) =>
    applyInteractionMovesEdgePreview(current, input.story, positionOverrides),
  );
}

function startStoryNodeDrag(
  input: Pick<
    StoryEditorNodeDragInput,
    | 'graphSelection'
    | 'selectedGraphNodeIds'
    | 'setElkEdgeRoutes'
    | 'closeInspector'
    | 'beginLocalEdit'
  >,
  node: StoryFlowNode,
) {
  input.setElkEdgeRoutes(new Map());
  if (input.graphSelection && !input.selectedGraphNodeIds.has(node.id)) {
    input.closeInspector();
  }
  input.beginLocalEdit();
}

function previewDraggedStoryNodes(
  input: Pick<
    StoryEditorNodeDragInput,
    'story' | 'graphSelection' | 'selectedGraphNodeIds' | 'setNodes' | 'setEdges'
  >,
  node: StoryFlowNode,
  draggedNodes: StoryFlowNode[],
) {
  const movedNodes = getMovedNarrativeNodes(input, node, draggedNodes);
  previewStoryNodeMoves(input, movedNodes, getInteractionPositionOverrides(movedNodes));
}

async function persistStoryNodeDrag(
  input: StoryEditorNodeDragInput,
  node: StoryFlowNode,
  draggedNodes: StoryFlowNode[],
) {
  const movedNodes = getMovedNarrativeNodes(input, node, draggedNodes);
  const positionOverrides = getInteractionPositionOverrides(movedNodes);
  const movedTriggers = movedNodes.filter(
    (movedNode): movedNode is Extract<StoryFlowNode, { type: 'trigger' }> =>
      movedNode.type === 'trigger',
  );
  const directlyMovedTriggerIds = new Set(movedTriggers.flatMap(({ data }) => data.triggerIds));
  const triggerUpdates = getInteractionMovesTriggerPositionUpdates(
    input.story,
    positionOverrides,
  ).filter((update) => update.triggerIds.every((id) => !directlyMovedTriggerIds.has(id)));
  previewStoryNodeMoves(input, movedNodes, positionOverrides);
  const interactionUpdates = Array.from(positionOverrides, ([interactionId, position]) => ({
    interactionId,
    position,
  }));
  const directlyMovedUpdates = movedTriggers.map(({ data, position }) => ({
    interactionId: data.interactionId,
    triggerIds: data.triggerIds,
    position,
  }));

  try {
    await input.saveGraphPositions({
      interactionUpdates,
      triggerUpdates: [...directlyMovedUpdates, ...triggerUpdates],
    });
  } finally {
    input.endLocalEdit();
  }
}

async function persistStoryCommentPinDrag(
  input: Pick<StoryEditorNodeDragInput, 'reanchorComment' | 'setNodes'>,
  node: CommentPinFlowNode,
) {
  const thread = node.data.thread;
  if (!thread || !node.data.canManageThread || thread.anchor.kind !== 'canvas') {
    return;
  }
  const originalPosition = thread.anchor.position;
  const result = await input.reanchorComment(thread.id, {
    kind: 'canvas',
    position: node.position,
  });
  if (result) {
    return;
  }
  input.setNodes((current) =>
    current.map((currentNode) =>
      currentNode.id === node.id ? { ...currentNode, position: originalPosition } : currentNode,
    ),
  );
}

function useStoryEditorNodeDragHandlers(input: StoryEditorNodeDragInput) {
  const stableInput = useMemo(
    () => ({
      story: input.story,
      graphSelection: input.graphSelection,
      selectedGraphNodeIds: input.selectedGraphNodeIds,
      setNodes: input.setNodes,
      setEdges: input.setEdges,
      setElkEdgeRoutes: input.setElkEdgeRoutes,
      closeInspector: input.closeInspector,
      beginLocalEdit: input.beginLocalEdit,
      endLocalEdit: input.endLocalEdit,
      saveGraphPositions: input.saveGraphPositions,
      reanchorComment: input.reanchorComment,
    }),
    [
      input.beginLocalEdit,
      input.closeInspector,
      input.endLocalEdit,
      input.graphSelection,
      input.saveGraphPositions,
      input.selectedGraphNodeIds,
      input.setEdges,
      input.setElkEdgeRoutes,
      input.setNodes,
      input.reanchorComment,
      input.story,
    ],
  );
  const handleNodeDragStart = useCallback(
    (_: MouseEvent | TouchEvent, node: StoryFlowNode) => startStoryNodeDrag(stableInput, node),
    [stableInput],
  );
  const handleNodeDrag = useCallback(
    (_: MouseEvent | TouchEvent, node: StoryFlowNode, draggedNodes: StoryFlowNode[]) =>
      previewDraggedStoryNodes(stableInput, node, draggedNodes),
    [stableInput],
  );
  const persistNodeDrag = useCallback(
    (node: StoryFlowNode, draggedNodes: StoryFlowNode[]) =>
      persistStoryNodeDrag(stableInput, node, draggedNodes),
    [stableInput],
  );
  const persistCanvasCommentDrag = useCallback(
    (node: CommentPinFlowNode) => persistStoryCommentPinDrag(stableInput, node),
    [stableInput],
  );
  return { handleNodeDragStart, handleNodeDrag, persistNodeDrag, persistCanvasCommentDrag };
}

type StoryEditorCommentActionInput = {
  story: Story | undefined;
  comments: ReturnType<typeof useStoryComments>;
  selectedCommentTarget: SelectedCommentTarget;
  selectedCommentTargetKey: string | undefined;
  selectedTargetThreads: StoryCommentThread[];
  showContextualComments: boolean;
  setCommentsOpen: (open: boolean) => void;
  setContextualCommentsTargetKey: (key: string | undefined) => void;
};

function openEntityCommentThread(
  input: StoryEditorCommentActionInput,
  targetType: CommentTargetType,
  targetId: string,
) {
  if (!input.story?.capabilities?.canComment) {
    return;
  }
  input.comments.startThread({ kind: 'entity', targetType, targetId });
  input.comments.selectThread(undefined);
  input.setCommentsOpen(false);
  input.setContextualCommentsTargetKey(`${targetType}:${targetId}`);
}

function resetContextualCommentState(input: StoryEditorCommentActionInput) {
  input.comments.cancelDraft();
  input.comments.selectThread(undefined);
  input.setContextualCommentsTargetKey(undefined);
}

function toggleStoryContextualComments(input: StoryEditorCommentActionInput) {
  if (input.showContextualComments) {
    resetContextualCommentState(input);
    return;
  }
  if (input.selectedTargetThreads.length > 0) {
    input.comments.cancelDraft();
    input.comments.selectThread(undefined);
    input.setCommentsOpen(false);
    input.setContextualCommentsTargetKey(input.selectedCommentTargetKey);
    return;
  }
  if (input.selectedCommentTarget) {
    openEntityCommentThread(
      input,
      input.selectedCommentTarget.targetType,
      input.selectedCommentTarget.targetId,
    );
  }
}

function selectTextCommentThread(input: StoryEditorCommentActionInput, field: CommentTextField) {
  if (!input.selectedCommentTargetKey) {
    return;
  }
  const thread =
    input.selectedTargetThreads.find(
      (candidate) =>
        candidate.status === 'open' &&
        candidate.anchor.kind === 'text' &&
        candidate.anchor.field === field,
    ) ??
    input.selectedTargetThreads.find(
      (candidate) => candidate.anchor.kind === 'text' && candidate.anchor.field === field,
    );
  if (!thread) {
    return;
  }
  input.comments.cancelDraft();
  input.comments.selectThread(thread.id);
  input.setCommentsOpen(false);
  input.setContextualCommentsTargetKey(input.selectedCommentTargetKey);
}

function selectSemanticCommentThread(
  input: StoryEditorCommentActionInput,
  slot: CommentSemanticSlot,
) {
  if (!input.selectedCommentTarget || !input.story?.capabilities?.canComment) {
    return;
  }
  const key = commentSemanticSlotKey(slot);
  const thread = findSemanticCommentThread(input.selectedTargetThreads, slot, key);
  if (thread) {
    input.comments.cancelDraft();
    input.comments.selectThread(thread.id);
  } else {
    const anchor = buildSemanticCommentAnchor(input.selectedCommentTarget, slot);
    if (anchor) {
      input.comments.startThread(anchor);
    }
    input.comments.selectThread(undefined);
  }
  input.setCommentsOpen(false);
  input.setContextualCommentsTargetKey(input.selectedCommentTargetKey);
}

function findSemanticCommentThread(
  threads: StoryCommentThread[],
  slot: CommentSemanticSlot,
  key: string,
) {
  const matchesSlot = (thread: StoryCommentThread) =>
    isSemanticCommentAnchor(thread.anchor) &&
    thread.anchor.kind === slot.kind &&
    commentSemanticSlotKey(thread.anchor) === key;
  return (
    threads.find((thread) => thread.status === 'open' && matchesSlot(thread)) ??
    threads.find(matchesSlot)
  );
}

function startStoryTextComment(input: StoryEditorCommentActionInput) {
  if (!input.selectedCommentTarget || !input.story?.capabilities?.canComment) {
    return;
  }
  const selection = captureActiveTextSelection();
  if (!selection) {
    return;
  }
  input.comments.startThread({
    kind: 'text',
    ...input.selectedCommentTarget,
    field: selection.field,
    selector: selection.selector,
  });
  input.comments.selectThread(undefined);
  input.setCommentsOpen(false);
  input.setContextualCommentsTargetKey(input.selectedCommentTargetKey);
}

async function reattachStoryCommentThread(
  input: Pick<StoryEditorCommentActionInput, 'comments' | 'selectedCommentTarget'>,
  threadId: string,
) {
  if (!input.selectedCommentTarget) {
    return;
  }
  const selection = captureActiveTextSelection();
  await input.comments.reanchor(
    threadId,
    selection
      ? {
          kind: 'text',
          ...input.selectedCommentTarget,
          field: selection.field,
          selector: selection.selector,
        }
      : { kind: 'entity', ...input.selectedCommentTarget },
  );
}

function bindStoryEditorCommentActions(input: StoryEditorCommentActionInput) {
  return {
    startEntityCommentForTarget: (targetType: CommentTargetType, targetId: string) =>
      openEntityCommentThread(input, targetType, targetId),
    startEntityComment: () =>
      input.selectedCommentTarget &&
      openEntityCommentThread(
        input,
        input.selectedCommentTarget.targetType,
        input.selectedCommentTarget.targetId,
      ),
    closeContextualComments: () => resetContextualCommentState(input),
    toggleContextualComments: () => toggleStoryContextualComments(input),
    openTextComments: (field: CommentTextField) => selectTextCommentThread(input, field),
    openSemanticComments: (slot: CommentSemanticSlot) => selectSemanticCommentThread(input, slot),
    startTextComment: () => startStoryTextComment(input),
    reattachSelectedThread: (threadId: string) => reattachStoryCommentThread(input, threadId),
  };
}

type StoryEditorPointerActionInput = {
  story: Story | undefined;
  reviewOnly: boolean;
  placingComment: boolean;
  commentsOpen: boolean;
  getFlowInstance: () => ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null;
  selectCommentThread: ReturnType<typeof useStoryComments>['selectThread'];
  setCanvasContextMenu: (state: CanvasContextMenuState | undefined) => void;
  setPlacingComment: Dispatch<SetStateAction<boolean>>;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  setContextualCommentsTargetKey: (key: string | undefined) => void;
  startCommentThread: ReturnType<typeof useStoryComments>['startThread'];
  closeInspector: () => void;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  cancelCommentDraft: ReturnType<typeof useStoryComments>['cancelDraft'];
};

function runStoryPaneClick(input: StoryEditorPointerActionInput, event: ReactMouseEvent) {
  input.setCanvasContextMenu(undefined);
  input.selectCommentThread(undefined);
  if (input.placingComment && input.story?.capabilities?.canComment) {
    const position = input.getFlowInstance()?.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    if (position) {
      runStartStoryCanvasComment(input, position);
    }
    input.setPlacingComment(false);
    return;
  }
  input.closeInspector();
}

function runStoryPaneContextMenu(
  input: StoryEditorPointerActionInput,
  event: MouseEvent | ReactMouseEvent,
) {
  event.preventDefault();
  if (input.reviewOnly && input.story?.capabilities?.canComment !== true) {
    return;
  }
  const position = input.getFlowInstance()?.screenToFlowPosition({
    x: event.clientX,
    y: event.clientY,
  });
  if (!position) {
    return;
  }
  input.setPlacingComment(false);
  input.selectCommentThread(undefined);
  input.setCanvasContextMenu({
    screenPosition: { x: event.clientX, y: event.clientY },
    flowPosition: position,
    target: { kind: 'canvas' },
  });
}

function runStoryNodeContextMenu(
  input: StoryEditorPointerActionInput,
  event: Parameters<NodeMouseHandler<StoryFlowNode>>[0],
  node: StoryFlowNode,
) {
  event.preventDefault();
  const target = getStoryNodeContextTarget(event, node);
  if (!target) {
    return;
  }
  const position = input.getFlowInstance()?.screenToFlowPosition({
    x: event.clientX,
    y: event.clientY,
  });
  if (!position || isUnavailableReviewTarget(input, target)) {
    return;
  }
  input.setPlacingComment(false);
  input.selectCommentThread(undefined);
  selectStoryGraphContextTarget(target, input.selectExclusive);
  input.setCanvasContextMenu({
    screenPosition: { x: event.clientX, y: event.clientY },
    flowPosition: position,
    target,
  });
}

function isUnavailableReviewTarget(
  input: Pick<StoryEditorPointerActionInput, 'reviewOnly' | 'story'>,
  target: StoryGraphElementContextTarget,
) {
  return (
    input.reviewOnly &&
    (input.story?.capabilities?.canComment !== true || target.kind === 'graphDecoration')
  );
}

function runStartStoryCanvasComment(input: StoryEditorPointerActionInput, position: Position) {
  if (input.story?.capabilities?.canComment !== true) {
    return;
  }
  input.startCommentThread({ kind: 'canvas', position });
  input.selectCommentThread(undefined);
  input.setCommentsOpen(false);
}

function runToggleStoryComments(input: StoryEditorPointerActionInput, commentsOpen: boolean) {
  if (!commentsOpen) {
    input.cancelCommentDraft();
    input.selectCommentThread(undefined);
    input.setContextualCommentsTargetKey(undefined);
  }
  input.setCommentsOpen((open) => !open);
}

function useStoryEditorPointerActions(input: StoryEditorPointerActionInput) {
  return {
    handlePaneClick: (event: ReactMouseEvent) => runStoryPaneClick(input, event),
    handlePaneContextMenu: (event: MouseEvent | ReactMouseEvent) =>
      runStoryPaneContextMenu(input, event),
    handleNodeContextMenu: (
      event: Parameters<NodeMouseHandler<StoryFlowNode>>[0],
      node: StoryFlowNode,
    ) => runStoryNodeContextMenu(input, event, node),
    startCanvasComment: (position: Position) => runStartStoryCanvasComment(input, position),
    toggleCommentsList: () => runToggleStoryComments(input, input.commentsOpen),
  };
}

function toggleGraphNodeSelection(input: StoryNodeSelectionInput) {
  const { event, node, reviewOnly, graphSelection, selectedId } = input;
  if (reviewOnly || node.type !== 'interaction' || !(event.ctrlKey || event.metaKey)) {
    return false;
  }
  const current = graphSelection?.interactionIds ?? (selectedId ? [selectedId] : []);
  const next = current.includes(node.id)
    ? current.filter((id) => id !== node.id)
    : [...current, node.id];
  input.selectGraphInteractions(next, graphSelection?.triggers);
  input.setCommentsOpen(false);
  return true;
}

function selectSingleGraphNode(input: StoryNodeSelectionInput) {
  if (input.node.type === 'graphDecoration') {
    if (!input.reviewOnly) {
      input.selectExclusive({ type: 'graphDecoration', id: input.node.id });
    }
    return;
  }
  if (input.node.type === 'interaction') {
    input.selectExclusive({ type: 'interaction', id: input.node.id });
  }
}

function getStoryNodeContextTarget(
  event: Parameters<NodeMouseHandler<StoryFlowNode>>[0],
  node: StoryFlowNode,
): StoryGraphElementContextTarget | undefined {
  const triggerElement =
    event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-interaction-id][data-trigger-id]')
      : null;
  const rootTriggerId = node.type === 'interaction' ? triggerElement?.dataset.triggerId : undefined;
  if (node.type === 'interaction' && rootTriggerId) {
    return { kind: 'trigger', interactionId: node.id, triggerId: rootTriggerId };
  }
  if (node.type === 'trigger') {
    return {
      kind: 'trigger',
      interactionId: node.data.interactionId,
      triggerId: node.data.triggerId,
    };
  }
  if (node.type === 'graphDecoration') {
    return { kind: 'graphDecoration', decorationId: node.id };
  }
  if (node.type === 'interaction') {
    return { kind: 'interaction', interactionId: node.id };
  }
  return undefined;
}

function selectStoryGraphContextTarget(
  target: StoryGraphElementContextTarget,
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void,
) {
  if (target.kind === 'interaction') {
    selectExclusive({ type: 'interaction', id: target.interactionId });
    return;
  }
  if (target.kind === 'trigger') {
    selectExclusive({
      type: 'trigger',
      trigger: { interactionId: target.interactionId, triggerId: target.triggerId },
    });
    return;
  }
  selectExclusive({ type: 'graphDecoration', id: target.decorationId });
}

type GraphElementDeletionOperations = {
  deleteInteraction: (interactionId: string) => Promise<unknown>;
  deleteTrigger: (interactionId: string, triggerId: string) => Promise<unknown>;
  deleteGraphDecoration: (decorationId: string) => Promise<unknown>;
};

function confirmGraphElementDeletion(
  target: StoryGraphElementContextTarget,
  story: Story | undefined,
  t: StoryEditorTranslate,
) {
  if (target.kind === 'interaction') {
    const interaction = story?.interactions.find(({ id }) => id === target.interactionId);
    if (!interaction) {
      return false;
    }
    return window.confirm(
      t('editor.confirmDeleteInteraction', {
        title: interactionTitleForDisplay(interaction, t),
      }),
    );
  }
  const message =
    target.kind === 'trigger' ? 'editor.confirmDeleteTrigger' : 'editor.confirmDeleteDecoration';
  return window.confirm(t(message));
}

async function removeGraphElement(
  target: StoryGraphElementContextTarget,
  operations: GraphElementDeletionOperations,
) {
  if (target.kind === 'interaction') {
    await operations.deleteInteraction(target.interactionId);
  } else if (target.kind === 'trigger') {
    await operations.deleteTrigger(target.interactionId, target.triggerId);
  } else {
    await operations.deleteGraphDecoration(target.decorationId);
  }
}

function waitForGraphPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
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
    window.requestAnimationFrame(() =>
      fitOrganizedGraph(layout.affectedNodeIds, input.scope, input.getFlowInstance),
    );
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

function scheduleIdleWork(callback: () => void) {
  const idleWindow = window as IdleCallbackWindow;

  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback, { timeout: 2_000 });
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(callback, 0);
  return () => window.clearTimeout(handle);
}

type StoryEditorOnboardingInput = {
  storyId: string;
  story?: Story;
  selectedId?: string;
  loadPhase: ReturnType<typeof useStoryEditorPersistence>['loadPhase'];
  storyRouteInaccessible: boolean;
};

function useStoryEditorOnboardingEffects({
  storyId,
  story,
  selectedId,
  loadPhase,
  storyRouteInaccessible,
}: StoryEditorOnboardingInput) {
  const { progress, reportStoryDeleted, reportStoryState, reportStepComplete } = useOnboarding();
  const lastOnboardingSnapshot = useRef<string | null>(null);
  useEffect(() => {
    if (storyRouteInaccessible) {
      reportStoryDeleted(storyId);
    }
  }, [reportStoryDeleted, storyId, storyRouteInaccessible]);
  useEffect(() => {
    if (loadPhase !== 'ready' || !story || story.id !== storyId) {
      return;
    }
    const snapshot = `${storyId}:${story.revision ?? 'loaded'}`;
    if (lastOnboardingSnapshot.current === snapshot) {
      return;
    }
    lastOnboardingSnapshot.current = snapshot;
    reportStoryState(storyId, storyHasAuthoredScene(story), storyHasBranchingChoice(story));
  }, [loadPhase, reportStoryState, story, storyId]);
  useEffect(() => {
    if (loadPhase !== 'ready' || !story || story.id !== storyId || !selectedId) {
      return;
    }
    if (story.interactions.some(({ id }) => id === selectedId)) {
      reportStepComplete(storyId, 'discover-interactions');
    }
  }, [loadPhase, progress, reportStepComplete, selectedId, story, storyId]);
  return { progress, reportStepComplete };
}

type StoryEditorSelectionActionsInput = {
  selection: ReturnType<typeof useStoryEditorSelection>;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  setContextualCommentsTargetKey: Dispatch<SetStateAction<string | undefined>>;
};

function useStoryEditorPrimarySelectionActions({
  selection,
  setCommentsOpen,
  setContextualCommentsTargetKey,
}: StoryEditorSelectionActionsInput) {
  const selectEditorExclusive = selection.selectExclusive;
  const selectEditorInteraction = selection.selectInteraction;
  const focusEditorInteraction = selection.focusInteraction;
  const selectExclusive = useCallback(
    (nextSelection?: StoryEditorExclusiveSelection) => {
      if (nextSelection) {
        setCommentsOpen(false);
      }
      setContextualCommentsTargetKey(undefined);
      selectEditorExclusive(nextSelection);
    },
    [selectEditorExclusive, setCommentsOpen, setContextualCommentsTargetKey],
  );
  const selectInteraction = useCallback(
    (interactionId: string) => {
      setCommentsOpen(false);
      setContextualCommentsTargetKey(undefined);
      selectEditorInteraction(interactionId);
    },
    [selectEditorInteraction, setCommentsOpen, setContextualCommentsTargetKey],
  );
  const focusInteraction = useCallback(
    (interactionId: string) => {
      setCommentsOpen(false);
      setContextualCommentsTargetKey(undefined);
      focusEditorInteraction(interactionId);
    },
    [focusEditorInteraction, setCommentsOpen, setContextualCommentsTargetKey],
  );
  return { selectExclusive, selectInteraction, focusInteraction };
}

function useStoryEditorSelectionResetActions({
  selection,
  setCommentsOpen,
  setContextualCommentsTargetKey,
}: StoryEditorSelectionActionsInput) {
  const clearSelection = selection.clearSelection;
  const startGraphSelection = selection.handleGraphSelectionStart;
  const closeInspector = useCallback(() => {
    setContextualCommentsTargetKey(undefined);
    clearSelection();
  }, [clearSelection, setContextualCommentsTargetKey]);
  const handleGraphSelectionStart = useCallback(
    (event: ReactMouseEvent) => {
      setCommentsOpen(false);
      setContextualCommentsTargetKey(undefined);
      startGraphSelection(event);
    },
    [startGraphSelection, setCommentsOpen, setContextualCommentsTargetKey],
  );
  return { closeInspector, handleGraphSelectionStart };
}

function useStoryEditorSelectionActions(input: StoryEditorSelectionActionsInput) {
  return {
    ...useStoryEditorPrimarySelectionActions(input),
    ...useStoryEditorSelectionResetActions(input),
  };
}

type StoryEditorNavigationInput = {
  story?: Story;
  selection: ReturnType<typeof useStoryEditorSelection>;
  flowInstanceRef: React.MutableRefObject<ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null>;
  selectInteraction: (interactionId: string) => void;
  focusInteraction: (interactionId: string) => void;
};

function useStoryEditorNavigation({
  story,
  selection,
  flowInstanceRef,
  selectInteraction,
  focusInteraction,
}: StoryEditorNavigationInput) {
  const contextNavigation = useStoryContextNavigation({
    story,
    selectedId: selection.selectedId,
    selectedContextReference: selection.selectedContextReference,
    flowInstanceRef,
    selectInteraction,
    focusInteraction,
  });
  const emphasizedInteractionIds =
    selection.groupInteractionIds ?? contextNavigation.emphasizedInteractionIds;
  return { contextNavigation, emphasizedInteractionIds };
}

type StoryEditorCommentsInput = {
  storyId: string;
  story?: Story;
  loadPhase: ReturnType<typeof useStoryEditorPersistence>['loadPhase'];
  commentsOpen: boolean;
  contextualCommentsTargetKey?: string;
  hasInspectorSelection: boolean;
  selectedCommentTarget?: ReturnType<typeof useStoryEditorSelection>['selectedCommentTarget'];
};

function useStoryEditorComments({
  storyId,
  story,
  loadPhase,
  commentsOpen,
  contextualCommentsTargetKey,
  hasInspectorSelection,
  selectedCommentTarget,
}: StoryEditorCommentsInput) {
  const commentAccess = loadPhase === 'ready' && story?.capabilities?.canEdit === true;
  const reviewOnly = loadPhase !== 'ready' || story?.capabilities?.canEdit === false;
  const comments = useStoryComments(storyId, commentAccess);
  const commentProjection = useStoryEditorCommentProjection({
    story,
    commentThreads: comments.threads,
    selectedCommentTarget,
    draftAnchor: comments.draftAnchor,
  });
  const commentSummary = useStoryEditorCommentSummary({
    commentsOpen,
    contextualCommentsTargetKey,
    hasInspectorSelection,
    selectedCommentTarget,
    selectedTargetThreads: commentProjection.selectedTargetThreads,
    contextualDraftAnchor: commentProjection.contextualDraftAnchor,
    counts: commentProjection.counts,
  });
  return { comments, commentProjection, commentSummary, reviewOnly, commentAccess };
}

function useStoryEditorCommentPermissions(story: Story | undefined, currentUserId?: string) {
  const canManageCommentThread = useCallback(
    (thread: StoryCommentThread) =>
      canActorManageCommentThread(story?.capabilities, currentUserId, thread),
    [currentUserId, story?.capabilities],
  );
  const canDeleteCommentThread = useCallback(
    (thread: StoryCommentThread) =>
      canActorDeleteCommentThread(story?.capabilities, currentUserId, thread),
    [currentUserId, story?.capabilities],
  );
  return { canManageCommentThread, canDeleteCommentThread };
}

function useStoryEditorCommentStateRuntime(
  input: StoryEditorCommentsInput & { currentUserId?: string },
) {
  const commentsModel = useStoryEditorComments(input);
  const permissions = useStoryEditorCommentPermissions(input.story, input.currentUserId);
  return {
    ...commentsModel,
    ...permissions,
    selectCommentThread: commentsModel.comments.selectThread,
  };
}

type StoryEditorCommentFocusInput = {
  threads: StoryCommentThread[];
  story?: Story;
  selectCommentThread: (threadId?: string) => void;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  setContextualCommentsTargetKey: Dispatch<SetStateAction<string | undefined>>;
  closeInspector: () => void;
  selectEditorExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  getFlowInstance: () => ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null;
};

function useStoryEditorCommentFocusActions({
  threads,
  story,
  selectCommentThread,
  setCommentsOpen,
  setContextualCommentsTargetKey,
  closeInspector,
  selectEditorExclusive,
  getFlowInstance,
}: StoryEditorCommentFocusInput) {
  return useCallback(
    (threadId: string) => {
      const thread = threads.find(({ id }) => id === threadId);
      if (!thread) {
        return;
      }
      selectCommentThread(thread.id);
      setCommentsOpen(false);
      setContextualCommentsTargetKey(commentTargetKey(thread.anchor));
      const focus = resolveCommentThreadFocus(thread, story);
      if (focus.clearSelection) {
        closeInspector();
      } else if (focus.selection) {
        selectEditorExclusive(focus.selection);
      }
      focusGraphNodes(focus.graphNodeIds, getFlowInstance);
    },
    [
      closeInspector,
      getFlowInstance,
      selectCommentThread,
      selectEditorExclusive,
      setCommentsOpen,
      setContextualCommentsTargetKey,
      story,
      threads,
    ],
  );
}

function resolveCommentTargetSelection(
  targetType: CommentTargetType,
  targetId: string,
  story?: Story,
): StoryEditorExclusiveSelection | undefined {
  if (targetType === 'interaction') {
    return { type: 'interaction', id: targetId };
  }
  if (targetType === 'location') {
    return { type: 'location', id: targetId };
  }
  if (targetType === 'character') {
    return { type: 'character', id: targetId };
  }
  if (targetType === 'statDefinition') {
    return { type: 'statDefinition', id: targetId };
  }
  if (targetType === 'itemDefinition') {
    return { type: 'itemDefinition', id: targetId };
  }
  const owner = story?.interactions.find((interaction) =>
    interaction.triggers.some(({ id }) => id === targetId),
  );
  return owner
    ? { type: 'trigger', trigger: { interactionId: owner.id, triggerId: targetId } }
    : undefined;
}

type StoryEditorCommentTargetInput = {
  activeThreads: StoryCommentThread[];
  story?: Story;
  selectCommentThread: (threadId?: string) => void;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  setContextualCommentsTargetKey: Dispatch<SetStateAction<string | undefined>>;
  selectEditorExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  closeInspector: () => void;
};

function useStoryEditorCommentTargetActions({
  activeThreads,
  story,
  selectCommentThread,
  setCommentsOpen,
  setContextualCommentsTargetKey,
  selectEditorExclusive,
  closeInspector,
}: StoryEditorCommentTargetInput) {
  return useCallback(
    (targetType: CommentTargetType, targetId: string) => {
      const thread = activeThreads.find(
        (candidate) =>
          candidate.status === 'open' &&
          candidate.anchor.kind !== 'canvas' &&
          candidate.anchor.targetType === targetType &&
          candidate.anchor.targetId === targetId,
      );
      if (!thread) {
        return;
      }
      selectCommentThread(undefined);
      setCommentsOpen(false);
      setContextualCommentsTargetKey(`${targetType}:${targetId}`);
      const selection = resolveCommentTargetSelection(targetType, targetId, story);
      if (selection) {
        selectEditorExclusive(selection);
      } else {
        closeInspector();
      }
    },
    [
      activeThreads,
      closeInspector,
      selectCommentThread,
      selectEditorExclusive,
      setCommentsOpen,
      setContextualCommentsTargetKey,
      story,
    ],
  );
}

function useStoryEditorCommentDeletionActions(
  t: StoryEditorTranslate,
  comments: ReturnType<typeof useStoryComments>,
  selectCommentThread: (threadId?: string) => void,
  setContextualCommentsTargetKey: Dispatch<SetStateAction<string | undefined>>,
) {
  const deleteThread = comments.deleteThread;
  const cancelDraft = comments.cancelDraft;
  const restoreThread = comments.restoreThread;
  const deleteCommentThread = useCallback(
    async (threadId: string) => {
      if (!window.confirm(t('comments.confirmDelete'))) {
        return;
      }
      const deleted = await deleteThread(threadId);
      if (!deleted) {
        return;
      }
      cancelDraft();
      selectCommentThread(undefined);
      setContextualCommentsTargetKey(undefined);
      return deleted;
    },
    [cancelDraft, deleteThread, selectCommentThread, setContextualCommentsTargetKey, t],
  );
  const restoreCommentThread = useCallback(
    (threadId: string) => restoreThread(threadId),
    [restoreThread],
  );
  return { deleteCommentThread, restoreCommentThread };
}

function useStoryGraphCreationPosition(
  story: Story | undefined,
  interactionSizes: ReadonlyMap<string, { width: number; height: number }>,
) {
  return useCallback(
    (creation: StoryGraphClickCreation) =>
      story ? getStoryGraphClickCreationPosition(story, creation, { interactionSizes }) : undefined,
    [interactionSizes, story],
  );
}

type StoryEditorInteractionFocusInput = {
  story?: Story;
  loadPhase: ReturnType<typeof useStoryEditorPersistence>['loadPhase'];
  searchParams: URLSearchParams;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
  appliedInitialFocusInteractionIdRef: React.MutableRefObject<string | undefined>;
  setPendingFocusInteractionId: Dispatch<SetStateAction<string | undefined>>;
  selectInteraction: (interactionId: string) => void;
};

function useStoryEditorInteractionFocus({
  story,
  loadPhase,
  searchParams,
  setSearchParams,
  appliedInitialFocusInteractionIdRef,
  setPendingFocusInteractionId,
  selectInteraction,
}: StoryEditorInteractionFocusInput) {
  const focusInteractionNode = useCallback(
    (interactionId: string) => {
      setPendingFocusInteractionId(interactionId);
      selectInteraction(interactionId);
    },
    [selectInteraction, setPendingFocusInteractionId],
  );
  const initialFocusInteractionId = searchParams.get('focusInteractionId');
  useEffect(() => {
    if (
      !initialFocusInteractionId ||
      appliedInitialFocusInteractionIdRef.current === initialFocusInteractionId ||
      loadPhase !== 'ready' ||
      !story?.interactions.some(({ id }) => id === initialFocusInteractionId)
    ) {
      return;
    }
    appliedInitialFocusInteractionIdRef.current = initialFocusInteractionId;
    focusInteractionNode(initialFocusInteractionId);
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('focusInteractionId');
    setSearchParams(nextSearchParams, { replace: true });
  }, [
    appliedInitialFocusInteractionIdRef,
    focusInteractionNode,
    initialFocusInteractionId,
    loadPhase,
    searchParams,
    setSearchParams,
    story?.interactions,
  ]);
  return focusInteractionNode;
}

type StoryEditorRelatedCreationInput = {
  createChildFromInteraction: ReturnType<
    typeof useStoryEditorPersistence
  >['createChildFromInteraction'];
  createParentForInteraction: ReturnType<
    typeof useStoryEditorPersistence
  >['createParentForInteraction'];
  getClickCreationPosition: ReturnType<typeof useStoryGraphCreationPosition>;
  focusInteractionNode: (interactionId: string) => void;
};

function useStoryEditorRelatedCreation({
  createChildFromInteraction,
  createParentForInteraction,
  getClickCreationPosition,
  focusInteractionNode,
}: StoryEditorRelatedCreationInput) {
  const createChildAndFocus = useCallback(
    async (sourceId: string, position?: Position) => {
      const interactionId = await createChildFromInteraction(
        sourceId,
        position ?? (await getClickCreationPosition({ kind: 'child', sourceId })),
      );
      if (interactionId) {
        focusInteractionNode(interactionId);
      }
    },
    [createChildFromInteraction, focusInteractionNode, getClickCreationPosition],
  );
  const createParentAndFocus = useCallback(
    async (targetId: string, position?: Position) => {
      const interactionId = await createParentForInteraction(
        targetId,
        position ?? (await getClickCreationPosition({ kind: 'parent', targetId })),
      );
      if (interactionId) {
        focusInteractionNode(interactionId);
      }
    },
    [createParentForInteraction, focusInteractionNode, getClickCreationPosition],
  );
  return { createChildAndFocus, createParentAndFocus };
}

type StoryEditorConnectionRuntimeInput = {
  story?: Story;
  interactionSizes: ReadonlyMap<string, { width: number; height: number }>;
  loadPhase: ReturnType<typeof useStoryEditorPersistence>['loadPhase'];
  searchParams: URLSearchParams;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
  appliedInitialFocusInteractionIdRef: React.MutableRefObject<string | undefined>;
  setPendingFocusInteractionId: Dispatch<SetStateAction<string | undefined>>;
  flowInstanceRef: React.MutableRefObject<ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null>;
  selectInteraction: (interactionId: string) => void;
  createChildFromInteraction: ReturnType<
    typeof useStoryEditorPersistence
  >['createChildFromInteraction'];
  createParentForInteraction: ReturnType<
    typeof useStoryEditorPersistence
  >['createParentForInteraction'];
  connectInteractions: ReturnType<typeof useStoryEditorPersistence>['connectInteractions'];
  connectToExistingTrigger: ReturnType<
    typeof useStoryEditorPersistence
  >['connectToExistingTrigger'];
  setConnectionConflict: Dispatch<SetStateAction<boolean>>;
  reportSaveError: ReturnType<typeof useStoryEditorPersistence>['reportSaveError'];
};

function useStoryEditorConnectionRuntime(input: StoryEditorConnectionRuntimeInput) {
  const getClickCreationPosition = useStoryGraphCreationPosition(
    input.story,
    input.interactionSizes,
  );
  const focusInteractionNode = useStoryEditorInteractionFocus({
    story: input.story,
    loadPhase: input.loadPhase,
    searchParams: input.searchParams,
    setSearchParams: input.setSearchParams,
    appliedInitialFocusInteractionIdRef: input.appliedInitialFocusInteractionIdRef,
    setPendingFocusInteractionId: input.setPendingFocusInteractionId,
    selectInteraction: input.selectInteraction,
  });
  const relatedCreation = useStoryEditorRelatedCreation({
    createChildFromInteraction: input.createChildFromInteraction,
    createParentForInteraction: input.createParentForInteraction,
    getClickCreationPosition,
    focusInteractionNode,
  });
  const connectionController = useStoryConnectionController({
    story: input.story,
    flowInstanceRef: input.flowInstanceRef,
    connectInteractions: input.connectInteractions,
    connectToExistingTrigger: input.connectToExistingTrigger,
    onConnectionConflict: input.setConnectionConflict,
    onUnexpectedError: input.reportSaveError,
    createChildFromInteraction: relatedCreation.createChildAndFocus,
    createParentForInteraction: relatedCreation.createParentAndFocus,
  });
  return {
    getClickCreationPosition,
    focusInteractionNode,
    ...relatedCreation,
    connectionController,
  };
}

function useStoryEditorRootCreation(
  createRoot: ReturnType<typeof useStoryEditorPersistence>['createRoot'],
  getClickCreationPosition: ReturnType<typeof useStoryGraphCreationPosition>,
  focusInteractionNode: (interactionId: string) => void,
) {
  return useCallback(
    async (position?: Position) => {
      const interactionId = await createRoot(
        position ?? (await getClickCreationPosition({ kind: 'root' })),
      );
      if (interactionId) {
        focusInteractionNode(interactionId);
      }
    },
    [createRoot, focusInteractionNode, getClickCreationPosition],
  );
}

function useStoryEditorPersistenceModel(
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

function useStoryEditorLocalUiState(searchParams: URLSearchParams) {
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

function useStoryEditorCanvasState(story?: Story) {
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

function useStoryEditorBaseRuntime() {
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

type StoryEditorInteractionStateInput = {
  storyId: string;
  story?: Story;
  loadPhase: ReturnType<typeof useStoryEditorPersistence>['loadPhase'];
  storyRouteInaccessible: boolean;
  flowInstanceRef: React.MutableRefObject<ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null>;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  setContextualCommentsTargetKey: Dispatch<SetStateAction<string | undefined>>;
};

function useStoryEditorInteractionState(input: StoryEditorInteractionStateInput) {
  const editorSelection = useStoryEditorSelection(input.story);
  const selectionActions = useStoryEditorSelectionActions({
    selection: editorSelection,
    setCommentsOpen: input.setCommentsOpen,
    setContextualCommentsTargetKey: input.setContextualCommentsTargetKey,
  });
  const navigation = useStoryEditorNavigation({
    story: input.story,
    selection: editorSelection,
    flowInstanceRef: input.flowInstanceRef,
    selectInteraction: selectionActions.selectInteraction,
    focusInteraction: selectionActions.focusInteraction,
  });
  const onboarding = useStoryEditorOnboardingEffects({
    storyId: input.storyId,
    story: input.story,
    selectedId: editorSelection.selectedId,
    loadPhase: input.loadPhase,
    storyRouteInaccessible: input.storyRouteInaccessible,
  });
  return { editorSelection, selectionActions, navigation, onboarding };
}

function useStoryEditorSelectionModel(input: StoryEditorInteractionStateInput) {
  const { editorSelection, selectionActions, navigation, onboarding } =
    useStoryEditorInteractionState(input);
  return {
    ...editorSelection,
    editorSelection,
    navigation,
    onboarding,
    selectEditorExclusive: editorSelection.selectExclusive,
    selectExclusive: selectionActions.selectExclusive,
    selectInteraction: selectionActions.selectInteraction,
    focusInteraction: selectionActions.focusInteraction,
    closeInspector: selectionActions.closeInspector,
    handleGraphSelectionStart: selectionActions.handleGraphSelectionStart,
  };
}

type StoryEditorInteractionNodesInput = {
  story?: Story;
  selectedId?: string;
  selectedTrigger?: SelectedTrigger;
  progress: ReturnType<typeof useOnboarding>['progress'];
  reviewOnly: boolean;
  createChildAndFocus: ReturnType<typeof useStoryEditorRelatedCreation>['createChildAndFocus'];
  createParentAndFocus: ReturnType<typeof useStoryEditorRelatedCreation>['createParentAndFocus'];
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  occurrenceCounts: ReturnType<typeof useStoryContextNavigation>['occurrenceCounts'];
  emphasizedInteractionIds: ReturnType<
    typeof useStoryContextNavigation
  >['emphasizedInteractionIds'];
  commentCounts: ReturnType<typeof useStoryEditorCommentProjection>['counts']['graphCommentCounts'];
  onOpenComments: ReturnType<typeof useStoryEditorCommentTargetActions>;
};

function buildStoryEditorInteractionNodes(input: StoryEditorInteractionNodesInput) {
  const onboardingBranchSourceId =
    currentOnboardingStep(input.progress) === 'create-branch'
      ? input.story?.interactions.find((interaction) =>
          interaction.triggers.some(({ inputInteractionIds }) => inputInteractionIds.length === 0),
        )?.id
      : undefined;
  return buildInteractionNodes(input.story, input.selectedId, input.selectedTrigger, {
    onCreateChild: input.reviewOnly
      ? undefined
      : (interactionId) => void input.createChildAndFocus(interactionId),
    onCreateParent: input.reviewOnly
      ? undefined
      : (interactionId) => void input.createParentAndFocus(interactionId),
    onSelectRootTrigger: (interactionId, triggerId) =>
      input.selectExclusive({ type: 'trigger', trigger: { interactionId, triggerId } }),
    onboardingBranchSourceId,
    occurrenceCounts: input.occurrenceCounts,
    emphasizedInteractionIds: input.emphasizedInteractionIds,
    commentCounts: input.commentCounts,
    onOpenComments: input.onOpenComments,
  });
}

function useStoryEditorInteractionNodes(input: StoryEditorInteractionNodesInput) {
  const {
    commentCounts,
    createChildAndFocus,
    createParentAndFocus,
    emphasizedInteractionIds,
    onOpenComments,
    occurrenceCounts,
    progress,
    reviewOnly,
    selectExclusive,
    selectedId,
    selectedTrigger,
    story,
  } = input;
  return useMemo(
    () =>
      buildStoryEditorInteractionNodes({
        commentCounts,
        createChildAndFocus,
        createParentAndFocus,
        emphasizedInteractionIds,
        onOpenComments,
        occurrenceCounts,
        progress,
        reviewOnly,
        selectExclusive,
        selectedId,
        selectedTrigger,
        story,
      }),
    [
      commentCounts,
      createChildAndFocus,
      createParentAndFocus,
      emphasizedInteractionIds,
      onOpenComments,
      occurrenceCounts,
      progress,
      reviewOnly,
      selectExclusive,
      selectedId,
      selectedTrigger,
      story,
    ],
  );
}

function useStoryEditorDecorationNodes(
  story: Story | undefined,
  selectedId: string | undefined,
  reviewOnly: boolean,
  updateGraphDecoration: ReturnType<typeof useStoryEditorPersistence>['updateGraphDecoration'],
) {
  return useMemo(
    () =>
      buildGraphDecorationNodes(
        story,
        selectedId,
        !reviewOnly,
        (id, patch) => void updateGraphDecoration(id, patch),
      ),
    [reviewOnly, selectedId, story, updateGraphDecoration],
  );
}

type StoryEditorTriggerNodesInput = {
  story?: Story;
  selectedTrigger?: SelectedTrigger;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  commentCounts: ReturnType<typeof useStoryEditorCommentProjection>['counts']['graphCommentCounts'];
  onOpenComments: ReturnType<typeof useStoryEditorCommentTargetActions>;
  t: StoryEditorTranslate;
};

function buildStoryEditorTriggerNodes(input: StoryEditorTriggerNodesInput) {
  const story = input.story;
  return buildTriggerNodes(story, input.selectedTrigger, {
    onSelectTrigger: (interactionId, triggerId) =>
      input.selectExclusive({ type: 'trigger', trigger: { interactionId, triggerId } }),
    conditionSummary: (triggers) => {
      if (!story) {
        return '';
      }
      return triggers
        .flatMap((trigger) =>
          getTriggerConditionGroups(trigger).map(({ conditions }) =>
            conditions.length === 0
              ? input.t('triggerInspector.noConditions')
              : conditions
                  .map((condition) => describeTriggerCondition(story, condition, input.t))
                  .join(` ${input.t('triggerInspector.and')} `),
          ),
        )
        .join(` ${input.t('triggerInspector.or')} `);
    },
    commentCounts: input.commentCounts,
    onOpenComments: input.onOpenComments,
  });
}

function useStoryEditorTriggerNodes(input: StoryEditorTriggerNodesInput) {
  const { commentCounts, onOpenComments, selectExclusive, selectedTrigger, story, t } = input;
  return useMemo(
    () =>
      buildStoryEditorTriggerNodes({
        commentCounts,
        onOpenComments,
        selectExclusive,
        selectedTrigger,
        story,
        t,
      }),
    [commentCounts, onOpenComments, selectExclusive, selectedTrigger, story, t],
  );
}

function useStoryEditorCommentPinNodes(input: CommentNodeInput) {
  const {
    activeCommentThreads,
    canDeleteCommentThread,
    canManageCommentThread,
    cancelCommentDraft,
    createComment,
    draftAnchor,
    deleteCommentThread,
    replyToComment,
    selectCommentThread,
    selectedThreadId,
    setCommentStatus,
    setCommentsOpen,
    canComment,
  } = input;
  return useMemo(
    () =>
      buildCommentPinNodes({
        activeCommentThreads,
        canDeleteCommentThread,
        canManageCommentThread,
        cancelCommentDraft,
        createComment,
        draftAnchor,
        deleteCommentThread,
        replyToComment,
        selectCommentThread,
        selectedThreadId,
        setCommentStatus,
        setCommentsOpen,
        canComment,
      }),
    [
      activeCommentThreads,
      canDeleteCommentThread,
      canManageCommentThread,
      cancelCommentDraft,
      createComment,
      draftAnchor,
      deleteCommentThread,
      replyToComment,
      selectCommentThread,
      selectedThreadId,
      setCommentStatus,
      setCommentsOpen,
      canComment,
    ],
  );
}

type StoryEditorNarrativeProjectionInput = {
  story?: Story;
  selectedId?: string;
  selectedTrigger?: SelectedTrigger;
  selectedGraphDecorationId?: string;
  progress: ReturnType<typeof useOnboarding>['progress'];
  reviewOnly: boolean;
  createChildAndFocus: ReturnType<typeof useStoryEditorRelatedCreation>['createChildAndFocus'];
  createParentAndFocus: ReturnType<typeof useStoryEditorRelatedCreation>['createParentAndFocus'];
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  occurrenceCounts: ReturnType<typeof useStoryContextNavigation>['occurrenceCounts'];
  emphasizedInteractionIds: ReturnType<
    typeof useStoryContextNavigation
  >['emphasizedInteractionIds'];
  graphCommentCounts: ReturnType<
    typeof useStoryEditorCommentProjection
  >['counts']['graphCommentCounts'];
  openCommentsForTarget: ReturnType<typeof useStoryEditorCommentTargetActions>;
  t: StoryEditorTranslate;
  graphSelection?: StoryGraphSelection;
  updateGraphDecoration: ReturnType<typeof useStoryEditorPersistence>['updateGraphDecoration'];
};

function useStoryEditorNarrativeProjection(input: StoryEditorNarrativeProjectionInput) {
  const storyNodes = useStoryEditorInteractionNodes({
    story: input.story,
    selectedId: input.selectedId,
    selectedTrigger: input.selectedTrigger,
    progress: input.progress,
    reviewOnly: input.reviewOnly,
    createChildAndFocus: input.createChildAndFocus,
    createParentAndFocus: input.createParentAndFocus,
    selectExclusive: input.selectExclusive,
    occurrenceCounts: input.occurrenceCounts,
    emphasizedInteractionIds: input.emphasizedInteractionIds,
    commentCounts: input.graphCommentCounts,
    onOpenComments: input.openCommentsForTarget,
  });
  const decorationNodes = useStoryEditorDecorationNodes(
    input.story,
    input.selectedGraphDecorationId,
    input.reviewOnly,
    input.updateGraphDecoration,
  );
  const triggerNodes = useStoryEditorTriggerNodes({
    story: input.story,
    selectedTrigger: input.selectedTrigger,
    selectExclusive: input.selectExclusive,
    commentCounts: input.graphCommentCounts,
    onOpenComments: input.openCommentsForTarget,
    t: input.t,
  });
  const initialFitViewOptions = useMemo(
    () => getInitialStoryFitViewOptions(input.story),
    [input.story],
  );
  const narrativeNodes = useStoryEditorNarrativeNodes(
    storyNodes,
    triggerNodes,
    input.graphSelection,
  );
  return { decorationNodes, initialFitViewOptions, narrativeNodes };
}

type StoryEditorCanvasCommentNodesInput = {
  story?: Story;
  comments: ReturnType<typeof useStoryComments>;
  activeCommentThreads: StoryCommentThread[];
  canManageCommentThread: (thread: StoryCommentThread) => boolean;
  canDeleteCommentThread: (thread: StoryCommentThread) => boolean;
  deleteCommentThread: ReturnType<
    typeof useStoryEditorCommentDeletionActions
  >['deleteCommentThread'];
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  reviewOnly: boolean;
  decorationNodes: ReturnType<typeof buildGraphDecorationNodes>;
  narrativeNodes: StoryFlowNode[];
  setNodes: Dispatch<SetStateAction<StoryFlowNode[]>>;
  nodes: StoryFlowNode[];
  pendingFocusInteractionId?: string;
  setPendingFocusInteractionId: Dispatch<SetStateAction<string | undefined>>;
  flowInstanceRef: React.MutableRefObject<ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null>;
};

function useStoryEditorCanvasCommentNodes(input: StoryEditorCanvasCommentNodesInput) {
  const commentNodes = useStoryEditorCommentPinNodes({
    activeCommentThreads: input.activeCommentThreads,
    draftAnchor: input.comments.draftAnchor,
    selectedThreadId: input.comments.selectedThreadId,
    canComment: input.story?.capabilities?.canComment === true,
    canManageCommentThread: input.canManageCommentThread,
    canDeleteCommentThread: input.canDeleteCommentThread,
    selectCommentThread: input.comments.selectThread,
    createComment: input.comments.create,
    cancelCommentDraft: input.comments.cancelDraft,
    replyToComment: input.comments.reply,
    setCommentStatus: input.comments.setStatus,
    deleteCommentThread: input.deleteCommentThread,
    setCommentsOpen: input.setCommentsOpen,
  });
  useStoryEditorFlowNodeSynchronization({
    decorationNodes: input.decorationNodes,
    narrativeNodes: input.narrativeNodes,
    commentNodes,
    reviewOnly: input.reviewOnly,
    setNodes: input.setNodes,
    nodes: input.nodes,
    pendingFocusInteractionId: input.pendingFocusInteractionId,
    setPendingFocusInteractionId: input.setPendingFocusInteractionId,
    flowInstanceRef: input.flowInstanceRef,
  });
  return commentNodes;
}

function useStoryEditorNarrativeNodes(
  storyNodes: StoryFlowNode[],
  triggerNodes: StoryFlowNode[],
  graphSelection: StoryGraphSelection | undefined,
) {
  return useMemo(
    () => applyStoryGraphSelection([...storyNodes, ...triggerNodes], graphSelection),
    [graphSelection, storyNodes, triggerNodes],
  );
}

type StoryEditorFlowNodeSyncInput = {
  decorationNodes: ReturnType<typeof buildGraphDecorationNodes>;
  narrativeNodes: StoryFlowNode[];
  commentNodes: CommentPinFlowNode[];
  reviewOnly: boolean;
  setNodes: Dispatch<SetStateAction<StoryFlowNode[]>>;
  nodes: StoryFlowNode[];
  pendingFocusInteractionId?: string;
  setPendingFocusInteractionId: Dispatch<SetStateAction<string | undefined>>;
  flowInstanceRef: React.MutableRefObject<ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null>;
};

function useStoryEditorFlowNodeSynchronization({
  decorationNodes,
  narrativeNodes,
  commentNodes,
  reviewOnly,
  setNodes,
  nodes,
  pendingFocusInteractionId,
  setPendingFocusInteractionId,
  flowInstanceRef,
}: StoryEditorFlowNodeSyncInput) {
  useEffect(() => {
    const projectedNodes = [
      ...decorationNodes,
      ...narrativeNodes.map((node) => (reviewOnly ? { ...node, draggable: false } : node)),
      ...commentNodes,
    ];
    setNodes((current) => reconcileStoryFlowNodes(current, projectedNodes));
  }, [commentNodes, decorationNodes, narrativeNodes, reviewOnly, setNodes]);
  useEffect(() => {
    const interactionId = pendingFocusInteractionId;
    if (!interactionId || !nodes.some((node) => node.id === interactionId)) {
      return;
    }
    window.requestAnimationFrame(() => {
      setPendingFocusInteractionId((current) => (current === interactionId ? undefined : current));
      void flowInstanceRef.current?.fitView({
        nodes: [{ id: interactionId }],
        duration: 250,
        padding: 0.7,
        maxZoom: 1,
      });
    });
  }, [flowInstanceRef, nodes, pendingFocusInteractionId, setPendingFocusInteractionId]);
}

function useStoryEditorFlowEdgeSynchronization(
  storyEdges: TriggerFlowEdge[],
  setEdges: Dispatch<SetStateAction<TriggerFlowEdge[]>>,
) {
  useEffect(() => {
    setEdges((current) => reconcileStoryFlowEdges(current, storyEdges));
  }, [setEdges, storyEdges]);
}

type StoryEditorEdgeModelInput = {
  story?: Story;
  elkEdgeRoutes: TriggerEdgeRoutes;
  setEdges: Dispatch<SetStateAction<TriggerFlowEdge[]>>;
  selectCommentThread: (threadId?: string) => void;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  deleteTriggerInput: ReturnType<typeof useStoryEditorPersistence>['deleteTriggerInput'];
  closeInspector: () => void;
};

function useStoryEditorEdgeModel({
  story,
  elkEdgeRoutes,
  setEdges,
  selectCommentThread,
  selectExclusive,
  deleteTriggerInput,
  closeInspector,
}: StoryEditorEdgeModelInput) {
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
      buildTriggerEdges(
        story,
        selectTriggerData,
        (interactionId, triggerId, inputId) => {
          void deleteSelectedTriggerInput(interactionId, triggerId, inputId);
        },
        elkEdgeRoutes,
      ),
    [deleteSelectedTriggerInput, elkEdgeRoutes, selectTriggerData, story],
  );
  useStoryEditorFlowEdgeSynchronization(storyEdges, setEdges);
  return { storyEdges, selectTriggerData, deleteSelectedTriggerInput };
}

type StoryEditorGroupActionsInput = {
  createGroup: ReturnType<typeof useStoryEditorPersistence>['createGroup'];
  creatingGroupRef: React.MutableRefObject<boolean>;
  clearSearch: () => void;
  openContextPanel: () => void;
  openContextSection: ReturnType<typeof useStoryContextNavigation>['openContextSection'];
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  setEditingGroupId: Dispatch<SetStateAction<string | undefined>>;
};

type StoryEditorGroupShortcutInput = {
  graphSelection?: StoryGraphSelection;
  reviewOnly: boolean;
  selectedId?: string;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  t: StoryEditorTranslate;
  createEditorGroup: (
    title: string,
    ids: string[],
    parentGroupId?: string,
  ) => Promise<string | false>;
};

function useStoryEditorGroupShortcut({
  createEditorGroup,
  graphSelection,
  reviewOnly,
  selectedId,
  setCommentsOpen,
  t,
}: StoryEditorGroupShortcutInput) {
  useEffect(() => {
    function handleGroupShortcut(event: KeyboardEvent) {
      if (!isGroupShortcut(event, reviewOnly)) {
        return;
      }
      const ids = graphSelection?.interactionIds ?? (selectedId ? [selectedId] : []);
      if (!ids.length) {
        return;
      }
      event.preventDefault();
      setCommentsOpen(false);
      void createEditorGroup(t('editor.groups.newGroup'), ids);
    }
    document.addEventListener('keydown', handleGroupShortcut);
    return () => document.removeEventListener('keydown', handleGroupShortcut);
  }, [createEditorGroup, graphSelection, reviewOnly, selectedId, setCommentsOpen, t]);
}

function useStoryEditorGroupActions(input: StoryEditorGroupActionsInput) {
  const {
    clearSearch,
    createGroup,
    creatingGroupRef,
    openContextPanel,
    openContextSection,
    selectExclusive,
    setCommentsOpen,
    setEditingGroupId,
  } = input;
  const createEditorGroup = useCallback(
    async (title: string, ids: string[], parentGroupId?: string) => {
      if (creatingGroupRef.current) {
        return false;
      }
      creatingGroupRef.current = true;
      try {
        const id = await createGroup(title, ids, parentGroupId);
        if (id) {
          clearSearch();
          openContextPanel();
          openContextSection('groups');
          setCommentsOpen(false);
          selectExclusive({ type: 'group', id });
          setEditingGroupId(id);
        }
        return id;
      } finally {
        creatingGroupRef.current = false;
      }
    },
    [
      clearSearch,
      createGroup,
      creatingGroupRef,
      openContextPanel,
      openContextSection,
      selectExclusive,
      setCommentsOpen,
      setEditingGroupId,
    ],
  );
  return createEditorGroup;
}

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
      if (decorationId) {
        selectExclusive({ type: 'graphDecoration', id: decorationId });
      }
    },
    [canvasRef, createGraphDecoration, flowInstanceRef, selectExclusive],
  );
}

type StoryEditorCommentEntryActionsInput = {
  story?: Story;
  reviewOnly: boolean;
  placingComment: boolean;
  commentsOpen: boolean;
  getFlowInstance: () => ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null;
  comments: ReturnType<typeof useStoryComments>;
  selectedCommentTarget?: ReturnType<typeof useStoryEditorSelection>['selectedCommentTarget'];
  selectedCommentTargetKey?: string;
  selectedTargetThreads: StoryCommentThread[];
  showContextualComments: boolean;
  setCanvasContextMenu: Dispatch<SetStateAction<CanvasContextMenuState | undefined>>;
  setPlacingComment: Dispatch<SetStateAction<boolean>>;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  setContextualCommentsTargetKey: Dispatch<SetStateAction<string | undefined>>;
  closeInspector: () => void;
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
};

function useStoryEditorCommentEntryActions(input: StoryEditorCommentEntryActionsInput) {
  const commentActions = bindStoryEditorCommentActions({
    story: input.story,
    comments: input.comments,
    selectedCommentTarget: input.selectedCommentTarget,
    selectedCommentTargetKey: input.selectedCommentTargetKey,
    selectedTargetThreads: input.selectedTargetThreads,
    showContextualComments: input.showContextualComments,
    setCommentsOpen: input.setCommentsOpen,
    setContextualCommentsTargetKey: input.setContextualCommentsTargetKey,
  });
  const pointerActions = useStoryEditorPointerActions({
    story: input.story,
    reviewOnly: input.reviewOnly,
    placingComment: input.placingComment,
    commentsOpen: input.commentsOpen,
    getFlowInstance: input.getFlowInstance,
    selectCommentThread: input.comments.selectThread,
    setCanvasContextMenu: input.setCanvasContextMenu,
    setPlacingComment: input.setPlacingComment,
    setCommentsOpen: input.setCommentsOpen,
    setContextualCommentsTargetKey: input.setContextualCommentsTargetKey,
    startCommentThread: input.comments.startThread,
    closeInspector: input.closeInspector,
    selectExclusive: input.selectExclusive,
    cancelCommentDraft: input.comments.cancelDraft,
  });
  return { commentActions, pointerActions };
}

type StoryEditorCommentActionsRuntimeInput = {
  t: StoryEditorTranslate;
  story?: Story;
  comments: ReturnType<typeof useStoryComments>;
  commentProjection: ReturnType<typeof useStoryEditorCommentProjection>;
  commentSummary: ReturnType<typeof useStoryEditorCommentSummary>;
  selectedCommentTarget?: ReturnType<typeof useStoryEditorSelection>['selectedCommentTarget'];
  closeInspector: () => void;
  selectEditorExclusive: (selection?: StoryEditorExclusiveSelection) => void;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  setContextualCommentsTargetKey: Dispatch<SetStateAction<string | undefined>>;
  setCanvasContextMenu: Dispatch<SetStateAction<CanvasContextMenuState | undefined>>;
  setPlacingComment: Dispatch<SetStateAction<boolean>>;
  getFlowInstance: () => ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null;
  reviewOnly: boolean;
  commentsOpen: boolean;
  placingComment: boolean;
};

function useStoryEditorCommentActionsRuntime(input: StoryEditorCommentActionsRuntimeInput) {
  const focusCommentThread = useStoryEditorCommentFocusActions({
    threads: input.commentProjection.projectedCommentThreads,
    story: input.story,
    selectCommentThread: input.comments.selectThread,
    setCommentsOpen: input.setCommentsOpen,
    setContextualCommentsTargetKey: input.setContextualCommentsTargetKey,
    closeInspector: input.closeInspector,
    selectEditorExclusive: input.selectEditorExclusive,
    getFlowInstance: input.getFlowInstance,
  });
  const openCommentsForTarget = useStoryEditorCommentTargetActions({
    activeThreads: input.commentProjection.activeCommentThreads,
    story: input.story,
    selectCommentThread: input.comments.selectThread,
    setCommentsOpen: input.setCommentsOpen,
    setContextualCommentsTargetKey: input.setContextualCommentsTargetKey,
    selectEditorExclusive: input.selectEditorExclusive,
    closeInspector: input.closeInspector,
  });
  const deletion = useStoryEditorCommentDeletionActions(
    input.t,
    input.comments,
    input.comments.selectThread,
    input.setContextualCommentsTargetKey,
  );
  const entryActions = useStoryEditorCommentEntryActions({
    story: input.story,
    reviewOnly: input.reviewOnly,
    placingComment: input.placingComment,
    commentsOpen: input.commentsOpen,
    getFlowInstance: input.getFlowInstance,
    comments: input.comments,
    selectedCommentTarget: input.selectedCommentTarget,
    selectedCommentTargetKey: input.commentSummary.selectedCommentTargetKey,
    selectedTargetThreads: input.commentProjection.selectedTargetThreads,
    showContextualComments: input.commentSummary.showContextualComments,
    setCanvasContextMenu: input.setCanvasContextMenu,
    setPlacingComment: input.setPlacingComment,
    setCommentsOpen: input.setCommentsOpen,
    setContextualCommentsTargetKey: input.setContextualCommentsTargetKey,
    closeInspector: input.closeInspector,
    selectExclusive: input.selectEditorExclusive,
  });
  return { focusCommentThread, openCommentsForTarget, ...deletion, ...entryActions };
}

type StoryEditorNodeSelectionInput = {
  reviewOnly: boolean;
  graphSelection?: StoryGraphSelection;
  selectedId?: string;
  selectedGraphNodeIds: ReadonlySet<string>;
  selectGraphInteractions: ReturnType<typeof useStoryEditorSelection>['selectGraphInteractions'];
  setCanvasContextMenu: Dispatch<SetStateAction<CanvasContextMenuState | undefined>>;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  selectCommentThread: ReturnType<typeof useStoryComments>['selectThread'];
  selectExclusive: (selection?: StoryEditorExclusiveSelection) => void;
};

function useStoryEditorNodeSelection(input: StoryEditorNodeSelectionInput) {
  const {
    graphSelection,
    reviewOnly,
    selectCommentThread,
    selectExclusive,
    selectGraphInteractions,
    selectedGraphNodeIds,
    selectedId,
    setCanvasContextMenu,
    setCommentsOpen,
  } = input;
  return useCallback(
    (event: ReactMouseEvent, node: StoryFlowNode) =>
      selectStoryFlowNode({
        event,
        node,
        reviewOnly,
        graphSelection,
        selectedId,
        selectedGraphNodeIds,
        selectGraphInteractions,
        setCanvasContextMenu,
        setCommentsOpen,
        selectCommentThread,
        selectExclusive,
      }),
    [
      graphSelection,
      reviewOnly,
      selectCommentThread,
      selectExclusive,
      selectGraphInteractions,
      selectedGraphNodeIds,
      selectedId,
      setCanvasContextMenu,
      setCommentsOpen,
    ],
  );
}

type StoryEditorGraphDeletionInput = {
  story?: Story;
  t: StoryEditorTranslate;
  setCanvasContextMenu: Dispatch<SetStateAction<CanvasContextMenuState | undefined>>;
  deleteInteraction: ReturnType<typeof useStoryEditorPersistence>['deleteInteraction'];
  deleteTrigger: ReturnType<typeof useStoryEditorPersistence>['deleteTrigger'];
  deleteGraphDecoration: ReturnType<typeof useStoryEditorPersistence>['deleteGraphDecoration'];
  closeInspector: () => void;
  selected?: Interaction;
};

function useStoryEditorGraphDeletion(input: StoryEditorGraphDeletionInput) {
  const {
    closeInspector,
    deleteGraphDecoration,
    deleteInteraction,
    deleteTrigger,
    setCanvasContextMenu,
    story,
    t,
    selected,
  } = input;
  const deleteGraphElement = useCallback(
    async (target: StoryGraphElementContextTarget) => {
      setCanvasContextMenu(undefined);
      if (!confirmGraphElementDeletion(target, story, t)) {
        return;
      }
      await removeGraphElement(target, {
        deleteInteraction,
        deleteTrigger,
        deleteGraphDecoration,
      });
      closeInspector();
    },
    [
      closeInspector,
      deleteGraphDecoration,
      deleteInteraction,
      deleteTrigger,
      setCanvasContextMenu,
      story,
      t,
    ],
  );
  const deleteSelectedTrigger = useCallback(
    (interactionId: string, triggerId: string) =>
      deleteGraphElement({ kind: 'trigger', interactionId, triggerId }),
    [deleteGraphElement],
  );
  const remove = useCallback(
    () =>
      selected
        ? deleteGraphElement({ kind: 'interaction', interactionId: selected.id })
        : Promise.resolve(),
    [deleteGraphElement, selected],
  );
  return { deleteGraphElement, deleteSelectedTrigger, remove };
}

function getSelectedGraphElementTarget(
  selected: Interaction | undefined,
  selectedTriggerTarget: ReturnType<typeof useStoryEditorSelection>['selectedTriggerTarget'],
  selectedGraphDecoration: GraphDecoration | undefined,
): StoryGraphElementContextTarget | undefined {
  if (selected) {
    return { kind: 'interaction', interactionId: selected.id };
  }
  if (selectedTriggerTarget) {
    return {
      kind: 'trigger',
      interactionId: selectedTriggerTarget.interaction.id,
      triggerId: selectedTriggerTarget.trigger.id,
    };
  }
  if (selectedGraphDecoration) {
    return { kind: 'graphDecoration', decorationId: selectedGraphDecoration.id };
  }
  return undefined;
}

type StoryEditorDeleteShortcutInput = {
  deleteGraphElement: (target: StoryGraphElementContextTarget) => Promise<unknown>;
  reviewOnly: boolean;
  selected?: Interaction;
  selectedTriggerTarget: ReturnType<typeof useStoryEditorSelection>['selectedTriggerTarget'];
  selectedGraphDecoration?: GraphDecoration;
};

function useStoryEditorDeleteShortcut({
  deleteGraphElement,
  reviewOnly,
  selected,
  selectedTriggerTarget,
  selectedGraphDecoration,
}: StoryEditorDeleteShortcutInput) {
  useEffect(() => {
    const handleDeleteShortcut = (event: KeyboardEvent) => {
      if (
        event.key !== 'Delete' ||
        event.defaultPrevented ||
        event.repeat ||
        reviewOnly ||
        isRealtimeEditableTarget(event.target)
      ) {
        return;
      }
      const target = getSelectedGraphElementTarget(
        selected,
        selectedTriggerTarget,
        selectedGraphDecoration,
      );
      if (target) {
        event.preventDefault();
        void deleteGraphElement(target);
      }
    };
    document.addEventListener('keydown', handleDeleteShortcut);
    return () => document.removeEventListener('keydown', handleDeleteShortcut);
  }, [deleteGraphElement, reviewOnly, selected, selectedGraphDecoration, selectedTriggerTarget]);
}

type StoryEditorActionModelInput = {
  persistence: ReturnType<typeof useStoryEditorPersistenceModel>;
  uiState: ReturnType<typeof useStoryEditorLocalUiState>;
  canvasState: ReturnType<typeof useStoryEditorCanvasState>;
  selection: ReturnType<typeof useStoryEditorSelectionModel>;
  contextNavigation: ReturnType<typeof useStoryContextNavigation>;
  reviewOnly: boolean;
  t: StoryEditorTranslate;
};

function useStoryEditorActionModel(input: StoryEditorActionModelInput) {
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

type StoryEditorBaseRuntime = ReturnType<typeof useStoryEditorBaseRuntime>;
type StoryEditorPageSelectionModel = ReturnType<typeof useStoryEditorSelectionModel>;
type StoryEditorConnectionRuntime = ReturnType<typeof useStoryEditorConnectionRuntime>;
type StoryEditorCommentStateRuntime = ReturnType<typeof useStoryEditorCommentStateRuntime>;
type StoryEditorCommentActionsRuntime = ReturnType<typeof useStoryEditorCommentActionsRuntime>;
type StoryEditorNarrativeProjection = ReturnType<typeof useStoryEditorNarrativeProjection>;

function useStoryEditorPageSelection(base: StoryEditorBaseRuntime) {
  const { persistence, uiState, canvasState } = base;
  const selectionModel = useStoryEditorSelectionModel({
    storyId: base.storyId,
    story: persistence.story,
    loadPhase: persistence.loadPhase,
    storyRouteInaccessible: persistence.storyRouteInaccessible,
    flowInstanceRef: canvasState.flowInstanceRef,
    setCommentsOpen: uiState.setCommentsOpen,
    setContextualCommentsTargetKey: uiState.setContextualCommentsTargetKey,
  });
  useStoryEditorGraphPreparation(persistence.loadPhase, persistence.story?.id);
  useStoryEditorHistoryShortcuts(persistence);
  const closeStorySettings = useStoryEditorSettingsClose({
    setStorySettingsTab: uiState.setStorySettingsTab,
    storySettingsTriggerRef: base.storySettingsTriggerRef,
    searchParams: base.searchParams,
    setSearchParams: base.setSearchParams,
  });
  return { selectionModel, closeStorySettings };
}

function useStoryEditorPageConnection(
  base: StoryEditorBaseRuntime,
  selection: StoryEditorPageSelectionModel,
) {
  const { persistence, canvasState } = base;
  return useStoryEditorConnectionRuntime({
    story: persistence.story,
    interactionSizes: canvasState.interactionSizes,
    loadPhase: persistence.loadPhase,
    searchParams: base.searchParams,
    setSearchParams: base.setSearchParams,
    appliedInitialFocusInteractionIdRef: canvasState.appliedInitialFocusInteractionIdRef,
    setPendingFocusInteractionId: canvasState.setPendingFocusInteractionId,
    flowInstanceRef: canvasState.flowInstanceRef,
    selectInteraction: selection.selectInteraction,
    createChildFromInteraction: persistence.createChildFromInteraction,
    createParentForInteraction: persistence.createParentForInteraction,
    connectInteractions: persistence.connectInteractions,
    connectToExistingTrigger: persistence.connectToExistingTrigger,
    setConnectionConflict: base.setConnectionConflict,
    reportSaveError: persistence.reportSaveError,
  });
}

function useStoryEditorPageComments(
  base: StoryEditorBaseRuntime,
  selection: StoryEditorPageSelectionModel,
  currentUserId?: string,
) {
  const { persistence, uiState, canvasState } = base;
  const commentState = useStoryEditorCommentStateRuntime({
    storyId: base.storyId,
    story: persistence.story,
    currentUserId,
    loadPhase: persistence.loadPhase,
    commentsOpen: uiState.commentsOpen,
    contextualCommentsTargetKey: uiState.contextualCommentsTargetKey,
    hasInspectorSelection: selection.hasInspectorSelection,
    selectedCommentTarget: selection.selectedCommentTarget,
  });
  const commentActionsRuntime = useStoryEditorCommentActionsRuntime({
    t: base.t,
    story: persistence.story,
    comments: commentState.comments,
    commentProjection: commentState.commentProjection,
    commentSummary: commentState.commentSummary,
    selectedCommentTarget: selection.selectedCommentTarget,
    closeInspector: selection.closeInspector,
    selectEditorExclusive: selection.selectEditorExclusive,
    setCommentsOpen: uiState.setCommentsOpen,
    setContextualCommentsTargetKey: uiState.setContextualCommentsTargetKey,
    setCanvasContextMenu: uiState.setCanvasContextMenu,
    setPlacingComment: uiState.setPlacingComment,
    getFlowInstance: () => canvasState.flowInstanceRef.current,
    reviewOnly: commentState.reviewOnly,
    commentsOpen: uiState.commentsOpen,
    placingComment: uiState.placingComment,
  });
  return { commentState, commentActionsRuntime };
}

function useStoryEditorPageNarrative(input: {
  base: StoryEditorBaseRuntime;
  selection: StoryEditorPageSelectionModel;
  connection: StoryEditorConnectionRuntime;
  comments: StoryEditorCommentStateRuntime;
  commentActions: StoryEditorCommentActionsRuntime;
}) {
  const { base, selection, connection, comments, commentActions } = input;
  const narrativeProjection = useStoryEditorNarrativeProjection({
    story: base.persistence.story,
    selectedId: selection.selectedId,
    selectedTrigger: selection.selectedTrigger,
    selectedGraphDecorationId: selection.selectedGraphDecorationId,
    progress: selection.onboarding.progress,
    reviewOnly: comments.reviewOnly,
    createChildAndFocus: connection.createChildAndFocus,
    createParentAndFocus: connection.createParentAndFocus,
    selectExclusive: selection.selectExclusive,
    occurrenceCounts: selection.navigation.contextNavigation.occurrenceCounts,
    emphasizedInteractionIds: selection.navigation.emphasizedInteractionIds,
    graphCommentCounts: comments.commentProjection.counts.graphCommentCounts,
    openCommentsForTarget: commentActions.openCommentsForTarget,
    t: base.t,
    graphSelection: selection.graphSelection,
    updateGraphDecoration: base.persistence.updateGraphDecoration,
  });
  return {
    createRootFromClick: useStoryEditorRootCreation(
      base.persistence.createRoot,
      connection.getClickCreationPosition,
      connection.focusInteractionNode,
    ),
    narrativeProjection,
  };
}

function useStoryEditorPageGraphSynchronization(input: {
  base: StoryEditorBaseRuntime;
  selection: StoryEditorPageSelectionModel;
  comments: StoryEditorCommentStateRuntime;
  commentActions: StoryEditorCommentActionsRuntime;
  narrative: StoryEditorNarrativeProjection;
}) {
  const { base, selection, comments, commentActions, narrative } = input;
  const { persistence, uiState, canvasState } = base;
  useStoryEditorCanvasCommentNodes({
    story: persistence.story,
    comments: comments.comments,
    activeCommentThreads: comments.commentProjection.activeCommentThreads,
    canManageCommentThread: comments.canManageCommentThread,
    canDeleteCommentThread: comments.canDeleteCommentThread,
    deleteCommentThread: commentActions.deleteCommentThread,
    setCommentsOpen: uiState.setCommentsOpen,
    reviewOnly: comments.reviewOnly,
    decorationNodes: narrative.decorationNodes,
    narrativeNodes: narrative.narrativeNodes,
    setNodes: canvasState.setNodes,
    nodes: canvasState.nodes,
    pendingFocusInteractionId: canvasState.pendingFocusInteractionId,
    setPendingFocusInteractionId: canvasState.setPendingFocusInteractionId,
    flowInstanceRef: canvasState.flowInstanceRef,
  });
  useStoryEditorEdgeModel({
    story: persistence.story,
    elkEdgeRoutes: canvasState.elkEdgeRoutes,
    setEdges: canvasState.setEdges,
    selectCommentThread: comments.selectCommentThread,
    selectExclusive: selection.selectExclusive,
    deleteTriggerInput: persistence.deleteTriggerInput,
    closeInspector: selection.closeInspector,
  });
}

function useStoryEditorPageNodeInteractions(
  base: StoryEditorBaseRuntime,
  selection: StoryEditorPageSelectionModel,
  comments: StoryEditorCommentStateRuntime,
) {
  const { persistence, uiState, canvasState } = base;
  const nodeDragHandlers = useStoryEditorNodeDragHandlers({
    story: persistence.story,
    graphSelection: selection.graphSelection,
    selectedGraphNodeIds: selection.selectedGraphNodeIds,
    setNodes: canvasState.setNodes,
    setEdges: canvasState.setEdges,
    setElkEdgeRoutes: canvasState.setElkEdgeRoutes,
    closeInspector: selection.closeInspector,
    beginLocalEdit: persistence.beginLocalEdit,
    endLocalEdit: persistence.endLocalEdit,
    saveGraphPositions: persistence.saveGraphPositions,
    reanchorComment: comments.comments.reanchor,
  });
  const selectNode = useStoryEditorNodeSelection({
    reviewOnly: comments.reviewOnly,
    graphSelection: selection.graphSelection,
    selectedId: selection.selectedId,
    selectedGraphNodeIds: selection.selectedGraphNodeIds,
    selectGraphInteractions: selection.selectGraphInteractions,
    setCanvasContextMenu: uiState.setCanvasContextMenu,
    setCommentsOpen: uiState.setCommentsOpen,
    selectCommentThread: comments.selectCommentThread,
    selectExclusive: selection.selectExclusive,
  });
  return { nodeDragHandlers, selectNode };
}

function useStoryEditorPageFlowModel(input: {
  base: StoryEditorBaseRuntime;
  selection: StoryEditorPageSelectionModel;
  comments: StoryEditorCommentStateRuntime;
  connection: StoryEditorConnectionRuntime;
  commentActions: StoryEditorCommentActionsRuntime;
  nodeInteractions: ReturnType<typeof useStoryEditorPageNodeInteractions>;
  narrative: StoryEditorNarrativeProjection;
}) {
  const { base, selection, comments, connection, commentActions, nodeInteractions, narrative } =
    input;
  const { persistence, canvasState } = base;
  const { connectionController } = connection;
  const { pointerActions } = commentActions;
  const { nodeDragHandlers, selectNode } = nodeInteractions;
  const flowModelInput: StoryEditorFlowModelInput = {
    nodes: canvasState.nodes,
    edges: canvasState.edges,
    onNodesChange: canvasState.handleNodesChange,
    onConnect: connectionController.requestConnection,
    onConnectStart: connectionController.startCanvasConnection,
    onConnectEnd: connectionController.endCanvasConnection,
    onNodeClick: selectNode,
    onNodeContextMenu: pointerActions.handleNodeContextMenu,
    onPaneClick: pointerActions.handlePaneClick,
    onPaneContextMenu: pointerActions.handlePaneContextMenu,
    onSelectionStart: selection.handleGraphSelectionStart,
    onSelectionChange: selection.handleGraphSelectionChange,
    onSelectionEnd: selection.handleGraphSelectionEnd,
    onNodeDragStart: nodeDragHandlers.handleNodeDragStart,
    onNodeDrag: nodeDragHandlers.handleNodeDrag,
    fitViewOptions: narrative.initialFitViewOptions,
    selectionOnDrag: !comments.reviewOnly,
    reviewOnly: comments.reviewOnly,
    nodeDragHandlers,
    updateGraphDecoration: persistence.updateGraphDecoration,
    endLocalEdit: persistence.endLocalEdit,
  };
  return {
    flowModelInput,
    flowEventHandlers: useStoryEditorFlowEventHandlers(flowModelInput),
  };
}

function useStoryEditorRuntime(base: StoryEditorBaseRuntime, currentUserId?: string) {
  const { selectionModel, closeStorySettings } = useStoryEditorPageSelection(base);
  const connection = useStoryEditorPageConnection(base, selectionModel);
  const { commentState, commentActionsRuntime } = useStoryEditorPageComments(
    base,
    selectionModel,
    currentUserId,
  );
  const narrative = useStoryEditorPageNarrative({
    base,
    selection: selectionModel,
    connection,
    comments: commentState,
    commentActions: commentActionsRuntime,
  });
  useStoryEditorPageGraphSynchronization({
    base,
    selection: selectionModel,
    comments: commentState,
    commentActions: commentActionsRuntime,
    narrative: narrative.narrativeProjection,
  });
  const graphRuntime = useStoryEditorGraphRuntime({
    base,
    selection: selectionModel,
    comments: commentState,
    connection,
    commentActions: commentActionsRuntime,
    narrative: narrative.narrativeProjection,
  });
  const { nodeInteractions, actionModel, flowModel } = graphRuntime;
  return {
    selection: selectionModel,
    connection,
    comments: commentState,
    commentActions: commentActionsRuntime,
    narrative: narrative.narrativeProjection,
    createRootFromClick: narrative.createRootFromClick,
    nodeInteractions,
    actions: actionModel,
    flowModel,
    closeStorySettings,
  };
}

function useStoryEditorGraphRuntime(input: {
  base: StoryEditorBaseRuntime;
  selection: StoryEditorPageSelectionModel;
  comments: StoryEditorCommentStateRuntime;
  connection: StoryEditorConnectionRuntime;
  commentActions: StoryEditorCommentActionsRuntime;
  narrative: StoryEditorNarrativeProjection;
}) {
  const { base, selection, comments, connection, commentActions, narrative } = input;
  const nodeInteractions = useStoryEditorPageNodeInteractions(base, selection, comments);
  const actionModel = useStoryEditorActionModel({
    persistence: base.persistence,
    uiState: base.uiState,
    canvasState: base.canvasState,
    selection,
    contextNavigation: selection.navigation.contextNavigation,
    reviewOnly: comments.reviewOnly,
    t: base.t,
  });
  const flowModel = useStoryEditorPageFlowModel({
    base,
    selection,
    comments,
    connection,
    commentActions,
    nodeInteractions,
    narrative,
  });
  return { nodeInteractions, actionModel, flowModel };
}

function useStoryEditorGraphPreparation(
  loadPhase: ReturnType<typeof useStoryEditorPersistence>['loadPhase'],
  storyId: string | undefined,
) {
  useEffect(() => {
    if (loadPhase !== 'ready' || !storyId) {
      return;
    }
    return scheduleIdleWork(() => {
      void preloadStoryGraphElk().catch(() => undefined);
    });
  }, [loadPhase, storyId]);
}

type StoryEditorHistoryShortcutInput = Pick<
  ReturnType<typeof useStoryEditorPersistence>,
  'saveStatus' | 'historyBusy' | 'history' | 'undo' | 'redo'
>;

function useStoryEditorHistoryShortcuts({
  saveStatus,
  historyBusy,
  history,
  undo,
  redo,
}: StoryEditorHistoryShortcutInput) {
  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      const action = historyShortcutAction(event, {
        saveStatus,
        historyBusy,
        canUndo: history.canUndo,
        canRedo: history.canRedo,
      });
      if (!action) {
        return;
      }
      event.preventDefault();
      void (action === 'undo' ? undo() : redo());
    };
    document.addEventListener('keydown', handleHistoryShortcut);
    return () => document.removeEventListener('keydown', handleHistoryShortcut);
  }, [history.canRedo, history.canUndo, historyBusy, redo, saveStatus, undo]);
}

type StoryEditorSettingsCloseInput = {
  setStorySettingsTab: Dispatch<SetStateAction<StorySettingsTab | undefined>>;
  storySettingsTriggerRef: React.RefObject<HTMLButtonElement | null>;
  searchParams: URLSearchParams;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
};

function useStoryEditorSettingsClose({
  setStorySettingsTab,
  storySettingsTriggerRef,
  searchParams,
  setSearchParams,
}: StoryEditorSettingsCloseInput) {
  return useCallback(() => {
    setStorySettingsTab(undefined);
    window.requestAnimationFrame(() => storySettingsTriggerRef.current?.focus());
    if (!searchParams.has('settings')) {
      return;
    }
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('settings');
    setSearchParams(nextSearchParams, { replace: true });
  }, [searchParams, setSearchParams, setStorySettingsTab, storySettingsTriggerRef]);
}

type StoryEditorCanvasToolbarInput = {
  story: Story;
  reviewOnly: boolean;
  isOrganizing: boolean;
  selectedLayoutTargets: StoryGraphLayoutTarget[];
  placingComment: boolean;
  history: ReturnType<typeof useStoryEditorPersistence>['history'];
  historyBusy: boolean;
  saveStatus: ReturnType<typeof useStoryEditorPersistence>['saveStatus'];
  historyOpen: boolean;
  undo: ReturnType<typeof useStoryEditorPersistence>['undo'];
  redo: ReturnType<typeof useStoryEditorPersistence>['redo'];
  setHistoryOpen: Dispatch<SetStateAction<boolean>>;
  refreshHistory: ReturnType<typeof useStoryEditorPersistence>['refreshHistory'];
  createRootFromClick: (position?: Position) => Promise<void>;
  addGraphDecoration: (kind: GraphDecoration['kind'], position?: Position) => Promise<void>;
  organizeGraph: ReturnType<typeof useStoryGraphOrganization>;
  setPlacingComment: Dispatch<SetStateAction<boolean>>;
};

function buildStoryEditorCanvasToolbarProps(input: StoryEditorCanvasToolbarInput) {
  return {
    canEdit: !input.reviewOnly,
    canComment: input.story.capabilities?.canComment === true,
    canOrganize: input.story.interactions.length > 0 && !input.isOrganizing,
    organizeSelectionCount: input.selectedLayoutTargets.length,
    placingComment: input.placingComment,
    canUndo: input.history.canUndo,
    canRedo: input.history.canRedo,
    historyBusy: input.historyBusy || input.saveStatus === 'saving' || input.saveStatus === 'error',
    historyOpen: input.historyOpen,
    onUndo: () => void input.undo(),
    onRedo: () => void input.redo(),
    onToggleHistory: () => {
      const open = !input.historyOpen;
      input.setHistoryOpen(open);
      if (open) {
        void input.refreshHistory();
      }
    },
    onCreateRoot: () => void input.createRootFromClick(),
    onAddFrame: () => void input.addGraphDecoration('frame'),
    onAddText: () => void input.addGraphDecoration('text'),
    onOrganize: () => void input.organizeGraph(),
    onToggleCommentPlacement: () => input.setPlacingComment((placing) => !placing),
  } satisfies React.ComponentProps<typeof StoryCanvasToolbar>;
}

type StoryEditorCanvasMenuActionsInput = {
  menu: CanvasContextMenuState;
  createRootFromClick: (position?: Position) => Promise<void>;
  startCanvasComment: (position: Position) => void;
  startEntityCommentForTarget: (targetType: CommentTargetType, targetId: string) => void;
  addGraphDecoration: (kind: GraphDecoration['kind'], position?: Position) => Promise<void>;
  createChildAndFocus: ReturnType<typeof useStoryEditorRelatedCreation>['createChildAndFocus'];
  deleteGraphElement: (target: StoryGraphElementContextTarget) => Promise<unknown>;
  organizeGraph: ReturnType<typeof useStoryGraphOrganization>;
  setCanvasContextMenu: Dispatch<SetStateAction<CanvasContextMenuState | undefined>>;
};

function buildStoryEditorCanvasMenuActions(input: StoryEditorCanvasMenuActionsInput) {
  const target = input.menu.target;
  return {
    onCreateInteraction: () => void input.createRootFromClick(input.menu.flowPosition),
    onAddComment: () => {
      if (target.kind === 'canvas') {
        input.startCanvasComment(input.menu.flowPosition);
      } else if (target.kind === 'interaction') {
        input.startEntityCommentForTarget('interaction', target.interactionId);
      } else if (target.kind === 'trigger') {
        input.startEntityCommentForTarget('trigger', target.triggerId);
      }
    },
    onAddFrame: () => void input.addGraphDecoration('frame', input.menu.flowPosition),
    onAddText: () => void input.addGraphDecoration('text', input.menu.flowPosition),
    onAddChild: () => {
      if (target.kind === 'interaction') {
        void input.createChildAndFocus(target.interactionId);
      }
    },
    onDelete: () => {
      if (target.kind !== 'canvas') {
        void input.deleteGraphElement(target);
      }
    },
    onOrganizeAll: () => void input.organizeGraph('all'),
    onOrganizeSelection: () => void input.organizeGraph('selection'),
    onOrganizeTarget: () => void input.organizeGraph('selection'),
    onClose: () => input.setCanvasContextMenu(undefined),
  } satisfies StoryEditorCanvasMenuActionProps;
}

type StoryEditorCanvasMenuActionProps = Omit<
  React.ComponentProps<typeof StoryCanvasContextMenu>,
  'position' | 'targetKind' | 'canEdit' | 'canComment' | 'canOrganize' | 'organizeSelectionCount'
>;

type StoryEditorFlowModelInput = Pick<
  ReactFlowProps<StoryFlowNode, TriggerFlowEdge>,
  | 'nodes'
  | 'edges'
  | 'onNodesChange'
  | 'onConnect'
  | 'onConnectStart'
  | 'onConnectEnd'
  | 'onNodeClick'
  | 'onNodeContextMenu'
  | 'onPaneClick'
  | 'onPaneContextMenu'
  | 'onSelectionStart'
  | 'onSelectionChange'
  | 'onSelectionEnd'
  | 'onNodeDragStart'
  | 'onNodeDrag'
  | 'fitViewOptions'
  | 'selectionOnDrag'
> & {
  reviewOnly: boolean;
  nodeDragHandlers: ReturnType<typeof useStoryEditorNodeDragHandlers>;
  updateGraphDecoration: ReturnType<typeof useStoryEditorPersistence>['updateGraphDecoration'];
  endLocalEdit: ReturnType<typeof useStoryEditorPersistence>['endLocalEdit'];
};

type StoryEditorFlowEventHandlers = {
  onNodeDragStop: NonNullable<ReactFlowProps<StoryFlowNode, TriggerFlowEdge>['onNodeDragStop']>;
};

function useStoryEditorFlowEventHandlers(
  input: StoryEditorFlowModelInput,
): StoryEditorFlowEventHandlers {
  const { endLocalEdit, nodeDragHandlers, reviewOnly, updateGraphDecoration } = input;
  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, node: StoryFlowNode, draggedNodes: StoryFlowNode[]) => {
      if (node.type === 'commentPin') {
        void nodeDragHandlers.persistCanvasCommentDrag(node);
        return;
      }
      if (reviewOnly) {
        return;
      }
      if (node.type === 'interaction' || node.type === 'trigger') {
        void nodeDragHandlers.persistNodeDrag(node, draggedNodes);
        return;
      }
      if (node.type === 'graphDecoration') {
        void updateGraphDecoration(node.id, { position: node.position });
      }
      endLocalEdit();
    },
    [endLocalEdit, nodeDragHandlers, reviewOnly, updateGraphDecoration],
  );
  return { onNodeDragStop };
}

function buildStoryEditorFlowProps(
  input: StoryEditorFlowModelInput,
  handlers: StoryEditorFlowEventHandlers,
) {
  return {
    nodes: input.nodes,
    edges: input.edges,
    nodeTypes,
    edgeTypes,
    onlyRenderVisibleElements: true,
    onNodesChange: input.onNodesChange,
    onConnect: input.reviewOnly ? undefined : input.onConnect,
    onConnectStart: input.reviewOnly ? undefined : input.onConnectStart,
    onConnectEnd: input.reviewOnly ? undefined : input.onConnectEnd,
    onNodeClick: input.onNodeClick,
    onNodeContextMenu: input.onNodeContextMenu,
    onPaneClick: input.onPaneClick,
    onPaneContextMenu: input.onPaneContextMenu,
    onSelectionStart: input.reviewOnly ? undefined : input.onSelectionStart,
    onSelectionChange: input.reviewOnly ? undefined : input.onSelectionChange,
    onSelectionEnd: input.reviewOnly ? undefined : input.onSelectionEnd,
    onNodeDragStart: input.reviewOnly ? undefined : input.onNodeDragStart,
    onNodeDrag: input.reviewOnly ? undefined : input.onNodeDrag,
    onNodeDragStop: handlers.onNodeDragStop,
    fitView: true,
    fitViewOptions: input.fitViewOptions,
    minZoom: 0.05,
    panOnDrag: canvasPanMouseButtons,
    panActivationKeyCode: 'Space',
    multiSelectionKeyCode: null,
    selectionOnDrag: input.selectionOnDrag,
    selectionMode: SelectionMode.Full,
    deleteKeyCode: null,
  } satisfies ReactFlowProps<StoryFlowNode, TriggerFlowEdge>;
}

type StoryEditorCanvasViewModel = {
  isOrganizing: boolean;
  connectionConflict: boolean;
  setConnectionConflict: Dispatch<SetStateAction<boolean>>;
  story: Story;
  reviewOnly: boolean;
  toolbarProps: React.ComponentProps<typeof StoryCanvasToolbar>;
  historyProps: React.ComponentProps<typeof StoryCanvasHistoryLayer>;
  contextMenu?: {
    state: CanvasContextMenuState;
    actions: StoryEditorCanvasMenuActionProps;
  };
  flowProps: ReactFlowProps<StoryFlowNode, TriggerFlowEdge>;
  selectedLayoutTargets: StoryGraphLayoutTarget[];
};

function StoryEditorCanvasToolbar({
  toolbarProps,
  historyProps,
}: Pick<StoryEditorCanvasViewModel, 'toolbarProps' | 'historyProps'>) {
  return (
    <>
      <StoryCanvasToolbar {...toolbarProps} />
      <StoryCanvasHistoryLayer {...historyProps} />
    </>
  );
}

function StoryEditorCanvasMenu({
  contextMenu: menu,
  story,
  reviewOnly,
  isOrganizing,
  selectedLayoutTargets,
}: Pick<
  StoryEditorCanvasViewModel,
  'contextMenu' | 'story' | 'reviewOnly' | 'isOrganizing' | 'selectedLayoutTargets'
>) {
  if (!menu) {
    return null;
  }
  return (
    <StoryCanvasContextMenu
      position={menu.state.screenPosition}
      targetKind={menu.state.target.kind}
      canEdit={!reviewOnly}
      canComment={story.capabilities?.canComment === true}
      canOrganize={story.interactions.length > 0 && !isOrganizing}
      organizeSelectionCount={selectedLayoutTargets.length}
      {...menu.actions}
    />
  );
}

function StoryEditorFlow({
  flowProps,
  onInit,
}: {
  flowProps: ReactFlowProps<StoryFlowNode, TriggerFlowEdge>;
  onInit: NonNullable<ReactFlowProps<StoryFlowNode, TriggerFlowEdge>['onInit']>;
}) {
  return (
    <ReactFlow {...flowProps} onInit={onInit}>
      <Background />
      <Controls />
    </ReactFlow>
  );
}

function StoryEditorCanvasContent({
  model,
  onInit,
}: {
  model: StoryEditorCanvasViewModel;
  onInit: NonNullable<ReactFlowProps<StoryFlowNode, TriggerFlowEdge>['onInit']>;
}) {
  return (
    <>
      <StoryCanvasConnectionAlert
        open={model.connectionConflict}
        onClose={() => model.setConnectionConflict(false)}
      />
      <StoryEditorCanvasToolbar
        toolbarProps={model.toolbarProps}
        historyProps={model.historyProps}
      />
      <StoryEditorCanvasMenu
        contextMenu={model.contextMenu}
        story={model.story}
        reviewOnly={model.reviewOnly}
        isOrganizing={model.isOrganizing}
        selectedLayoutTargets={model.selectedLayoutTargets}
      />
      <StoryEditorFlow flowProps={model.flowProps} onInit={onInit} />
    </>
  );
}

export function StoryEditor({ currentUserId }: { currentUserId?: string }) {
  const base = useStoryEditorBaseRuntime();
  const runtime = useStoryEditorRuntime(base, currentUserId);
  return <StoryEditorRoute base={base} runtime={runtime} currentUserId={currentUserId} />;
}

type StoryEditorRouteProps = {
  base: StoryEditorBaseRuntime;
  runtime: ReturnType<typeof useStoryEditorRuntime>;
  currentUserId?: string;
};

function StoryEditorRoute({ base, runtime, currentUserId }: StoryEditorRouteProps) {
  const { persistence, routeLocation, storyId, uiState } = base;
  if (persistence.storyRouteInaccessible) {
    return (
      <StoryUnavailablePage
        authenticated={Boolean(currentUserId)}
        returnTo={`${routeLocation.pathname}${routeLocation.search}`}
      />
    );
  }
  if (!persistence.story) {
    return <main className="page">{persistence.error || base.t('editor.loading')}</main>;
  }
  if (uiState.storySettingsRouteTab === 'access' && !persistence.story.capabilities?.canManage) {
    return (
      <StoryUnavailablePage
        authenticated={Boolean(currentUserId)}
        reason="access-settings"
        returnTo={`${routeLocation.pathname}${routeLocation.search}`}
        storyId={storyId}
      />
    );
  }
  if (persistence.story.capabilities?.canEdit !== true) {
    return <Navigate to={`/stories/${storyId}/play`} replace />;
  }
  return <StoryEditorPage base={base} runtime={runtime} />;
}

function buildStoryEditorInspectorActionsForPage(
  base: StoryEditorBaseRuntime,
  runtime: ReturnType<typeof useStoryEditorRuntime>,
) {
  return buildStoryEditorInspectorActions({
    commentActions: runtime.commentActions.commentActions,
    entityActions: runtime.actions.entityActions,
    setCommentsOpen: base.uiState.setCommentsOpen,
    closeInspector: runtime.selection.closeInspector,
    deleteCommentThread: runtime.commentActions.deleteCommentThread,
    restoreCommentThread: runtime.commentActions.restoreCommentThread,
    focusCommentThread: runtime.commentActions.focusCommentThread,
    deleteGraphElement: runtime.actions.graphDeletion.deleteGraphElement,
    deleteSelectedTrigger: runtime.actions.graphDeletion.deleteSelectedTrigger,
    remove: runtime.actions.graphDeletion.remove,
    createEditorGroup: runtime.actions.createEditorGroup,
    updateGraphDecoration: base.persistence.updateGraphDecoration,
    selectExclusive: runtime.selection.selectExclusive,
    reportStepComplete: runtime.selection.onboarding.reportStepComplete,
    persistence: base.persistence,
  });
}

function buildStoryEditorInspectorModelForPage(
  base: StoryEditorBaseRuntime,
  runtime: ReturnType<typeof useStoryEditorRuntime>,
) {
  const story = base.persistence.story;
  if (!story) {
    return undefined;
  }
  return buildStoryEditorInspectorModel({
    story,
    storyId: base.storyId,
    t: base.t,
    reviewOnly: runtime.comments.reviewOnly,
    commentsOpen: base.uiState.commentsOpen,
    hasInspectorSelection: runtime.selection.hasInspectorSelection,
    selection: runtime.selection.editorSelection,
    comments: runtime.comments.comments,
    commentProjection: runtime.comments.commentProjection,
    commentSummary: runtime.comments.commentSummary,
    canManageCommentThread: runtime.comments.canManageCommentThread,
    canDeleteCommentThread: runtime.comments.canDeleteCommentThread,
    categories: runtime.selection.navigation.contextNavigation,
    actions: buildStoryEditorInspectorActionsForPage(base, runtime),
  });
}

function buildStoryEditorHistoryProps(base: StoryEditorBaseRuntime) {
  const { persistence } = base;
  return {
    open: base.uiState.historyOpen,
    history: persistence.history,
    busy:
      persistence.historyBusy ||
      persistence.saveStatus === 'saving' ||
      persistence.saveStatus === 'error',
    onUndo: () => void persistence.undo(),
    onRedo: () => void persistence.redo(),
    onClose: () => base.uiState.setHistoryOpen(false),
  } satisfies React.ComponentProps<typeof StoryCanvasHistoryLayer>;
}

function buildStoryEditorCanvasContextMenu(
  base: StoryEditorBaseRuntime,
  runtime: ReturnType<typeof useStoryEditorRuntime>,
): StoryEditorCanvasViewModel['contextMenu'] {
  const menu = base.uiState.canvasContextMenu;
  if (!menu) {
    return undefined;
  }
  return {
    state: menu,
    actions: buildStoryEditorCanvasMenuActions({
      menu,
      createRootFromClick: runtime.createRootFromClick,
      startCanvasComment: runtime.commentActions.pointerActions.startCanvasComment,
      startEntityCommentForTarget:
        runtime.commentActions.commentActions.startEntityCommentForTarget,
      addGraphDecoration: runtime.actions.addGraphDecoration,
      createChildAndFocus: runtime.connection.createChildAndFocus,
      deleteGraphElement: runtime.actions.graphDeletion.deleteGraphElement,
      organizeGraph: runtime.actions.organizeGraph,
      setCanvasContextMenu: base.uiState.setCanvasContextMenu,
    }),
  };
}

function buildStoryEditorCanvasModel(
  base: StoryEditorBaseRuntime,
  runtime: ReturnType<typeof useStoryEditorRuntime>,
): StoryEditorCanvasViewModel | undefined {
  const { persistence, canvasState, uiState } = base;
  const story = persistence.story;
  if (!story) {
    return undefined;
  }
  const { reviewOnly } = runtime.comments;
  const { selectedLayoutTargets, organizeGraph, addGraphDecoration } = runtime.actions;
  const createToolbarProps = buildStoryEditorCanvasToolbarProps({
    story,
    reviewOnly,
    isOrganizing: canvasState.isOrganizing,
    selectedLayoutTargets,
    placingComment: uiState.placingComment,
    history: persistence.history,
    historyBusy: persistence.historyBusy,
    saveStatus: persistence.saveStatus,
    historyOpen: uiState.historyOpen,
    undo: persistence.undo,
    redo: persistence.redo,
    setHistoryOpen: uiState.setHistoryOpen,
    refreshHistory: persistence.refreshHistory,
    createRootFromClick: runtime.createRootFromClick,
    addGraphDecoration,
    organizeGraph,
    setPlacingComment: uiState.setPlacingComment,
  });
  return {
    isOrganizing: canvasState.isOrganizing,
    connectionConflict: base.connectionConflict,
    setConnectionConflict: base.setConnectionConflict,
    story,
    reviewOnly,
    toolbarProps: createToolbarProps,
    historyProps: buildStoryEditorHistoryProps(base),
    contextMenu: buildStoryEditorCanvasContextMenu(base, runtime),
    flowProps: buildStoryEditorFlowProps(
      runtime.flowModel.flowModelInput,
      runtime.flowModel.flowEventHandlers,
    ),
    selectedLayoutTargets,
  };
}

function StoryEditorPage({ base, runtime }: Pick<StoryEditorRouteProps, 'base' | 'runtime'>) {
  const story = base.persistence.story;
  if (!story) {
    return <main className="page">{base.persistence.error || base.t('editor.loading')}</main>;
  }
  const canvasModel = buildStoryEditorCanvasModel(base, runtime);
  const inspectorModel = buildStoryEditorInspectorModelForPage(base, runtime);
  if (!canvasModel || !inspectorModel) {
    return null;
  }
  return (
    <main
      className="editor-page"
      onFocusCapture={(event) =>
        handleStoryEditorFocus(base.persistence, runtime.comments.reviewOnly, event)
      }
      onBlurCapture={(event) =>
        handleStoryEditorBlur(base.persistence, runtime.comments.reviewOnly, event)
      }
    >
      {base.persistence.pendingSaveGuard}
      <StoryEditorHeader base={base} runtime={runtime} story={story} />
      <StoryEditorAlerts base={base} runtime={runtime} />
      <StoryEditorWorkspace
        base={base}
        runtime={runtime}
        canvasModel={canvasModel}
        inspectorModel={inspectorModel}
      />
      <StoryEditorSettings
        base={base}
        closeStorySettings={runtime.closeStorySettings}
        story={story}
      />
    </main>
  );
}

function handleStoryEditorFocus(
  persistence: StoryEditorBaseRuntime['persistence'],
  reviewOnly: boolean,
  event: React.FocusEvent<HTMLElement>,
) {
  if (!reviewOnly && isRealtimeEditableTarget(event.target)) {
    persistence.beginLocalEdit();
  }
}

function handleStoryEditorBlur(
  persistence: StoryEditorBaseRuntime['persistence'],
  reviewOnly: boolean,
  event: React.FocusEvent<HTMLElement>,
) {
  if (!reviewOnly && isRealtimeEditableTarget(event.target)) {
    persistence.endLocalEdit();
  }
}

function StoryEditorHeader({
  base,
  runtime,
  story,
}: Pick<StoryEditorRouteProps, 'base' | 'runtime'> & { story: Story }) {
  const { persistence, uiState } = base;
  const selected = runtime.selection.selected;
  const startingInteraction = story.interactions.find((interaction) =>
    interaction.triggers.some(({ inputInteractionIds }) => inputInteractionIds.length === 0),
  );
  const simulationPath = selected
    ? `/stories/${base.storyId}/play?mode=simulation&startInteractionId=${encodeURIComponent(selected.id)}`
    : `/stories/${base.storyId}/play?mode=simulation`;
  return (
    <StoryEditorToolbar
      story={story}
      reviewOnly={runtime.comments.reviewOnly}
      setStory={persistence.setStory}
      renameStory={persistence.renameStory}
      settingsTriggerRef={base.storySettingsTriggerRef}
      setStorySettingsTab={uiState.setStorySettingsTab}
      t={base.t}
      loadPhase={persistence.loadPhase}
      commentAccess={runtime.comments.commentAccess}
      commentsOpen={uiState.commentsOpen}
      toggleCommentsList={runtime.commentActions.pointerActions.toggleCommentsList}
      realtimeStatus={persistence.realtimeStatus}
      saveStatus={persistence.saveStatus}
      storyId={base.storyId}
      simulationFromStartPath={`/stories/${base.storyId}/play?mode=simulation`}
      simulationPath={simulationPath}
      selected={selected}
      startingInteraction={startingInteraction}
      comments={runtime.comments.comments}
    />
  );
}

function StoryEditorAlerts({ base, runtime }: Pick<StoryEditorRouteProps, 'base' | 'runtime'>) {
  const { persistence, uiState, canvasState } = base;
  const { comments, commentSummary } = runtime.comments;
  return (
    <>
      {persistence.error ? (
        <div className="save-error" role="alert">
          <span>{persistence.error}</span>
          <button className="secondary" type="button" onClick={() => void persistence.retry()}>
            {base.t('editor.reloadStory')}
          </button>
        </div>
      ) : null}
      {canvasState.failedOrganizationScope ? (
        <div className="save-error" role="alert">
          <span>{base.t('editor.organizeFailed')}</span>
          <button
            className="secondary"
            type="button"
            onClick={() => void runtime.actions.organizeGraph(canvasState.failedOrganizationScope)}
          >
            {base.t('editor.retryOrganize')}
          </button>
        </div>
      ) : null}
      {comments.error && !uiState.commentsOpen && !commentSummary.showContextualComments ? (
        <div className="save-error" role="alert">
          <span>{comments.error}</span>
          <button className="secondary" type="button" onClick={() => void comments.reload()}>
            {base.t('comments.retry')}
          </button>
        </div>
      ) : null}
    </>
  );
}

function StoryEditorWorkspace({
  base,
  runtime,
  canvasModel,
  inspectorModel,
}: Pick<StoryEditorRouteProps, 'base' | 'runtime'> & {
  canvasModel: StoryEditorCanvasViewModel;
  inspectorModel: StoryEditorInspectorModel;
}) {
  const navigation = runtime.selection.navigation.contextNavigation;
  const { hasInspector, showContextualComments } = runtime.comments.commentSummary;
  const locationPanelOpen = navigation.isContextPanelOpen;
  return (
    <div
      className={`editor-layout with-navigation ${locationPanelOpen ? '' : 'with-navigation-collapsed'} ${
        hasInspector ? 'with-inspector' : ''
      } ${showContextualComments ? 'with-comment-rail' : ''}`}
    >
      <StoryEditorNavigationPanel base={base} runtime={runtime} story={canvasModel.story} />
      <StoryEditorCanvasPanel base={base} model={canvasModel} />
      <StoryEditorInspector model={inspectorModel} />
    </div>
  );
}

function StoryEditorNavigationPanel({
  base,
  runtime,
  story,
}: Pick<StoryEditorRouteProps, 'base' | 'runtime'> & { story: Story }) {
  const { selection, comments, actions, commentActions } = runtime;
  return (
    <StoryContextPanel
      story={story}
      navigation={selection.navigation.contextNavigation}
      selection={selection.editorSelection}
      reviewOnly={comments.reviewOnly}
      commentCounts={comments.commentProjection.counts.commentCountsByTarget}
      selectExclusive={selection.selectExclusive}
      selectInteraction={selection.selectInteraction}
      setCommentsOpen={base.uiState.setCommentsOpen}
      openCommentsForTarget={commentActions.openCommentsForTarget}
      flowInstanceRef={base.canvasState.flowInstanceRef}
      groupActions={{
        create: actions.createEditorGroup,
        editingGroupId: base.uiState.editingGroupId,
        setEditingGroupId: base.uiState.setEditingGroupId,
        update: base.persistence.updateGroup,
        delete: base.persistence.deleteGroup,
      }}
      entityActions={actions.entityActions}
      t={base.t}
    />
  );
}

function StoryEditorCanvasPanel({
  base,
  model,
}: Pick<StoryEditorRouteProps, 'base'> & { model: StoryEditorCanvasViewModel }) {
  const { canvasRef, flowInstanceRef } = base.canvasState;
  return (
    <section
      className="canvas"
      data-onboarding-target="graph"
      ref={canvasRef}
      aria-busy={model.isOrganizing}
    >
      <StoryEditorCanvasContent
        model={model}
        onInit={(instance) => {
          flowInstanceRef.current = instance;
        }}
      />
    </section>
  );
}

function StoryEditorSettings({
  base,
  closeStorySettings,
  story,
}: Pick<StoryEditorRouteProps, 'base'> & {
  closeStorySettings: () => void;
  story: Story;
}) {
  const initialTab = base.uiState.openStorySettingsTab;
  if (!initialTab) {
    return null;
  }
  return (
    <StorySettingsDialog
      storyId={base.storyId}
      startDateTime={story.startDateTime ?? '2000-01-03T08:00'}
      initialTab={initialTab}
      canManageAccess={story.capabilities?.canManage === true}
      onSaveStartDateTime={base.persistence.updateStoryStartDateTime}
      onClose={closeStorySettings}
    />
  );
}

type CommentNodeInput = {
  activeCommentThreads: StoryCommentThread[];
  draftAnchor: CommentAnchor | undefined;
  selectedThreadId: string | undefined;
  canComment: boolean;
  canManageCommentThread: (thread: StoryCommentThread) => boolean;
  canDeleteCommentThread: (thread: StoryCommentThread) => boolean;
  selectCommentThread: ReturnType<typeof useStoryComments>['selectThread'];
  createComment: ReturnType<typeof useStoryComments>['create'];
  cancelCommentDraft: ReturnType<typeof useStoryComments>['cancelDraft'];
  replyToComment: ReturnType<typeof useStoryComments>['reply'];
  setCommentStatus: ReturnType<typeof useStoryComments>['setStatus'];
  deleteCommentThread: CommentPinNodeData['onDelete'];
  setCommentsOpen: (open: boolean) => void;
};

function isCanvasCommentThread(thread: StoryCommentThread): thread is StoryCommentThread & {
  anchor: Extract<CommentAnchor, { kind: 'canvas' }>;
} {
  return thread.anchor.kind === 'canvas';
}

function buildCommentPinNodes(input: CommentNodeInput): CommentPinFlowNode[] {
  const threadNodes = input.activeCommentThreads.flatMap((thread) =>
    isCanvasCommentThread(thread) ? [buildCommentThreadPin(thread, input)] : [],
  );
  if (input.draftAnchor?.kind !== 'canvas') {
    return threadNodes;
  }
  return [...threadNodes, buildCommentDraftPin(input.draftAnchor, input)];
}

function buildCommentThreadPin(
  thread: StoryCommentThread & {
    anchor: Extract<CommentAnchor, { kind: 'canvas' }>;
  },
  input: CommentNodeInput,
): CommentPinFlowNode {
  return {
    id: 'comment:' + thread.id,
    type: 'commentPin',
    position: thread.anchor.position,
    draggable: input.canManageCommentThread(thread),
    selectable: false,
    zIndex: 1_000,
    data: {
      thread,
      expanded: thread.id === input.selectedThreadId,
      canComment: input.canComment,
      canManageThread: input.canManageCommentThread(thread),
      canDeleteThread: input.canDeleteCommentThread(thread),
      onOpen: (threadId) => {
        input.selectCommentThread(threadId);
        input.setCommentsOpen(false);
      },
      onCreate: input.createComment,
      onCancelDraft: input.cancelCommentDraft,
      onReply: input.replyToComment,
      onStatus: input.setCommentStatus,
      onDelete: input.deleteCommentThread,
    },
  };
}

function buildCommentDraftPin(
  draftAnchor: Extract<CommentAnchor, { kind: 'canvas' }>,
  input: CommentNodeInput,
): CommentPinFlowNode {
  return {
    id: 'comment:draft',
    type: 'commentPin',
    position: draftAnchor.position,
    draggable: false,
    selectable: false,
    zIndex: 1_001,
    data: {
      draftAnchor,
      expanded: true,
      canComment: input.canComment,
      canManageThread: false,
      canDeleteThread: false,
      onOpen: input.selectCommentThread,
      onCreate: input.createComment,
      onCancelDraft: input.cancelCommentDraft,
      onReply: input.replyToComment,
      onStatus: input.setCommentStatus,
      onDelete: input.deleteCommentThread,
    },
  };
}

type ReviewTargetInspectorProps = {
  interaction?: Interaction;
  trigger?: Trigger;
  location?: Location;
  character?: Character;
  statDefinition?: StatDefinition;
  itemDefinition?: ItemDefinition;
} & InspectorTextCommentProps;

type ReviewCommentDisplayProps = Pick<
  ReviewTargetInspectorProps,
  'textCommentCounts' | 'onOpenTextComments'
>;

type ReviewNamedTarget =
  | { type: 'location'; target: Location }
  | { type: 'character'; target: Character }
  | { type: 'stat'; target: StatDefinition }
  | { type: 'item'; target: ItemDefinition };

function ReviewTargetInspector(props: ReviewTargetInspectorProps) {
  if (props.interaction) {
    return (
      <ReviewInteractionTarget
        interaction={props.interaction}
        textCommentCounts={props.textCommentCounts}
        onOpenTextComments={props.onOpenTextComments}
      />
    );
  }
  if (props.trigger) {
    return <ReviewTriggerTarget trigger={props.trigger} />;
  }

  const target = resolveReviewNamedTarget(props);
  if (!target) {
    return null;
  }
  return (
    <ReviewNamedTarget
      {...target}
      textCommentCounts={props.textCommentCounts}
      onOpenTextComments={props.onOpenTextComments}
    />
  );
}

function resolveReviewNamedTarget(
  props: ReviewTargetInspectorProps,
): ReviewNamedTarget | undefined {
  if (props.location) {
    return { type: 'location', target: props.location };
  }
  if (props.character) {
    return { type: 'character', target: props.character };
  }
  if (props.statDefinition) {
    return { type: 'stat', target: props.statDefinition };
  }
  if (props.itemDefinition) {
    return { type: 'item', target: props.itemDefinition };
  }
  return undefined;
}

function ReviewInteractionTarget({
  interaction,
  textCommentCounts,
  onOpenTextComments,
}: ReviewCommentDisplayProps & { interaction: Interaction }) {
  const { t } = useTranslation();
  return (
    <div className="review-target-inspector">
      <h3>{t('inspector.interaction')}</h3>
      <InspectorCommentField
        field="title"
        label={t('interactionInspector.title')}
        textCommentCounts={textCommentCounts}
        onOpenTextComments={onOpenTextComments}
      >
        <h2 data-comment-field="title">{interactionTitleForDisplay(interaction, t)}</h2>
      </InspectorCommentField>
      <InspectorCommentField
        field="body"
        label={t('richText.content')}
        textCommentCounts={textCommentCounts}
        onOpenTextComments={onOpenTextComments}
      >
        <div data-comment-field="body">
          <RichTextContent html={interaction.body} />
        </div>
      </InspectorCommentField>
    </div>
  );
}

function ReviewTriggerTarget({ trigger }: { trigger: Trigger }) {
  const { t } = useTranslation();
  return (
    <div className="review-target-inspector">
      <h3>{t('inspector.trigger')}</h3>
      <p>{t('comments.triggerSummary', { count: getTriggerConditions(trigger).length })}</p>
    </div>
  );
}

function ReviewNamedTarget({
  type,
  target,
  textCommentCounts,
  onOpenTextComments,
}: ReviewCommentDisplayProps & ReviewNamedTarget) {
  const { t } = useTranslation();
  const description = 'description' in target ? target.description : undefined;
  return (
    <div className="review-target-inspector">
      <h3>{t('inspector.' + type)}</h3>
      <InspectorCommentField
        field="name"
        label={t('inspector.name')}
        textCommentCounts={textCommentCounts}
        onOpenTextComments={onOpenTextComments}
      >
        <h2 data-comment-field="name">{target.name}</h2>
      </InspectorCommentField>
      {description ? (
        <InspectorCommentField
          field="description"
          label={t('inspector.description')}
          textCommentCounts={textCommentCounts}
          onOpenTextComments={onOpenTextComments}
        >
          <p data-comment-field="description">{description}</p>
        </InspectorCommentField>
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
