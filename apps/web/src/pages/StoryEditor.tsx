import { lazy, Suspense, useCallback, useRef, type CSSProperties } from 'react';
import { Navigate } from 'react-router-dom';
import type { Story } from '@paralleax/shared';
import '@xyflow/react/dist/style.css';
import '../features/story-editor/graph/storyGraph.css';
import {
  StoryEditorCanvasContent,
  type StoryEditorCanvasViewModel,
} from '../features/story-editor/graph/StoryEditorCanvasContent';
import {
  buildStoryEditorCanvasModel,
  buildStoryEditorInspectorModelForPage,
} from '../features/story-editor/graph/storyEditorPageModels';
import { useStoryEditorBaseRuntime } from '../features/story-editor/graph/useStoryEditorBaseRuntime';
import {
  useStoryEditorRuntime,
  type StoryEditorBaseRuntime,
} from '../features/story-editor/graph/useStoryEditorRuntime';
import { StoryEditorInspector } from '../features/story-editor/inspectors/StoryEditorInspector';
import type { StoryEditorInspectorModel } from '../features/story-editor/inspectors/storyEditorInspectorModel';
import { useStoryEditorInspectorLayout } from '../features/story-editor/inspectors/useStoryEditorInspectorLayout';
import { StoryContextPanel } from '../features/story-editor/navigation/StoryContextPanel';
import { StoryEditorToolbar } from '../features/story-editor/StoryEditorToolbar';
import { StoryUnavailablePage } from '../features/story/StoryUnavailablePage';
import { isRealtimeEditableTarget } from '../features/realtime/storyRealtime';
const StorySettingsDialog = lazy(() =>
  import('../features/story-settings/StorySettingsDialog').then((module) => ({
    default: module.StorySettingsDialog,
  })),
);

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
  if (
    uiState.storySettingsRouteTab === 'access' &&
    persistence.story.capabilities?.canManage !== true
  ) {
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
      onFocusCapture={(event) => {
        handleStoryEditorFocus(base.persistence, runtime.comments.reviewOnly, event);
      }}
      onBlurCapture={(event) => {
        handleStoryEditorBlur(base.persistence, runtime.comments.reviewOnly, event);
      }}
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
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const onResizePreview = useCallback((width: number) => {
    layoutRef.current?.style.setProperty('--editor-inspector-width', `${width}px`);
  }, []);
  const inspectorLayout = useStoryEditorInspectorLayout(locationPanelOpen, onResizePreview);
  const layoutStyle: CSSProperties & { '--editor-inspector-width': string } = {
    '--editor-inspector-width': `${inspectorLayout.width}px`,
  };
  return (
    <div
      ref={layoutRef}
      style={layoutStyle}
      className={`editor-layout with-navigation ${locationPanelOpen ? '' : 'with-navigation-collapsed'} ${
        hasInspector ? 'with-inspector' : ''
      } ${showContextualComments ? 'with-comment-rail' : ''} ${
        inspectorLayout.maximized && hasInspector ? 'is-inspector-maximized' : ''
      }`}
    >
      <StoryEditorNavigationPanel base={base} runtime={runtime} story={canvasModel.story} />
      <StoryEditorCanvasPanel base={base} model={canvasModel} />
      <StoryEditorInspector model={inspectorModel} layout={inspectorLayout} />
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
      focusInteractions={(ids) => {
        void base.canvasState.flowInstanceRef.current?.fitView({
          nodes: ids.map((id) => ({ id })),
          padding: 0.3,
          maxZoom: 1,
          duration: 250,
        });
      }}
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
    <Suspense fallback={null}>
      <StorySettingsDialog
        storyId={base.storyId}
        startDateTime={story.startDateTime ?? '2000-01-03T08:00'}
        initialTab={initialTab}
        canManageAccess={story.capabilities?.canManage === true}
        onSaveStartDateTime={base.persistence.updateStoryStartDateTime}
        onClose={closeStorySettings}
      />
    </Suspense>
  );
}
