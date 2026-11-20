import { ContextualCommentsRail } from '../../comments/ContextualCommentsRail';
import { StoryCommentsPanel } from '../../comments/StoryCommentsPanel';
import { TextCommentAction } from '../../comments/TextCommentAction';
import { InspectorResizeHandle } from './InspectorResizeHandle';
import { StoryInspectorContent } from './StoryInspectorContent';
import type { StoryEditorInspectorModel } from './storyEditorInspectorModel';
import type { StoryEditorInspectorLayout } from './useStoryEditorInspectorLayout';

export function StoryEditorInspector({
  model,
  layout,
}: {
  model: StoryEditorInspectorModel;
  layout: StoryEditorInspectorLayout;
}) {
  return (
    <>
      <StoryContextualCommentsPanel model={model} />
      {model.commentsOpen ? (
        <StoryCommentsInspector model={model} layout={layout} />
      ) : model.hasInspectorSelection ? (
        <StoryInspectorPanel model={model} layout={layout} />
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

function StoryCommentsInspector({
  model,
  layout,
}: {
  model: StoryEditorInspectorModel;
  layout: StoryEditorInspectorLayout;
}) {
  return (
    <div
      className="inspector comments-inspector"
      id="story-inspector-panel"
      data-testid="comments-inspector"
    >
      {!layout.maximized ? (
        <InspectorResizeHandle
          label={model.t('editor.resizeInspector')}
          controls="story-inspector-panel"
          value={layout.width}
          minimum={layout.minimum}
          maximum={layout.maximum}
          onResize={layout.onResize}
          onResizePreview={layout.onResizePreview}
        />
      ) : null}
      <StoryCommentsInspectorContent model={model} layout={layout} />
    </div>
  );
}

function StoryCommentsInspectorContent({
  model,
  layout,
}: {
  model: StoryEditorInspectorModel;
  layout: StoryEditorInspectorLayout;
}) {
  return (
    <StoryCommentsPanel
      open
      placement="inspector"
      headerActions={
        <InspectorMaximizeButton
          maximized={layout.maximized}
          maximizeLabel={model.t('editor.maximizeInspector')}
          restoreLabel={model.t('editor.restoreInspector')}
          onToggle={layout.onToggleMaximized}
        />
      }
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
      onClose={() => {
        model.actions.setCommentsOpen(false);
      }}
      onSelect={(threadId) => {
        selectCommentInspectorThread(model, threadId);
      }}
      onCancelDraft={model.comments.cancelDraft}
      onCreate={model.comments.create}
      onReply={model.comments.reply}
      onStatus={model.comments.setStatus}
      onDelete={model.actions.deleteCommentThread}
      onRestore={model.actions.restoreCommentThread}
      onLoadDeleted={model.comments.loadDeleted}
    />
  );
}

function selectCommentInspectorThread(
  model: StoryEditorInspectorModel,
  threadId: string | undefined,
) {
  if (threadId === undefined || threadId.length === 0) {
    model.comments.selectThread(undefined);
    return;
  }
  const thread = model.projectedCommentThreads.find(({ id }) => id === threadId);
  if (thread?.deletedAt !== undefined && thread.deletedAt.length > 0) {
    model.comments.selectThread(threadId);
  } else {
    model.actions.focusCommentThread(threadId);
  }
}

function StoryInspectorPanel({
  model,
  layout,
}: {
  model: StoryEditorInspectorModel;
  layout: StoryEditorInspectorLayout;
}) {
  const { selection } = model;
  return (
    <aside
      className="inspector"
      id="story-inspector-panel"
      data-onboarding-target={
        selection.selected && !model.reviewOnly ? 'scene-inspector' : undefined
      }
      aria-label={model.t('editor.inspector')}
    >
      {!layout.maximized ? (
        <InspectorResizeHandle
          label={model.t('editor.resizeInspector')}
          controls="story-inspector-panel"
          value={layout.width}
          minimum={layout.minimum}
          maximum={layout.maximum}
          onResize={layout.onResize}
          onResizePreview={layout.onResizePreview}
        />
      ) : null}
      <StoryInspectorHeader model={model} layout={layout} />
      <div className="inspector-content">
        <StoryInspectorContent model={model} />
      </div>
    </aside>
  );
}

function StoryInspectorHeader({
  model,
  layout,
}: {
  model: StoryEditorInspectorModel;
  layout: StoryEditorInspectorLayout;
}) {
  return (
    <div className="inspector-header">
      {model.selection.selectedCommentTarget && model.story.capabilities?.canComment === true ? (
        <StoryInspectorCommentActions model={model} />
      ) : null}
      <InspectorMaximizeButton
        maximized={layout.maximized}
        maximizeLabel={model.t('editor.maximizeInspector')}
        restoreLabel={model.t('editor.restoreInspector')}
        onToggle={layout.onToggleMaximized}
      />
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
      <TextCommentAction onStart={model.actions.startTextComment} />
    </div>
  );
}

function InspectorMaximizeButton({
  maximized,
  maximizeLabel,
  restoreLabel,
  onToggle,
}: {
  maximized: boolean;
  maximizeLabel: string;
  restoreLabel: string;
  onToggle: () => void;
}) {
  const label = maximized ? restoreLabel : maximizeLabel;
  return (
    <button
      className="ghost inspector-maximize"
      type="button"
      aria-label={label}
      aria-pressed={maximized}
      title={label}
      onClick={onToggle}
    >
      <span aria-hidden="true">{maximized ? '▢' : '⛶'}</span>
    </button>
  );
}
