import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CanvasActionIcon } from '../../components/StoryCanvasToolbar';
import type { StoryRealtimeStatus } from '../realtime/storyRealtime';
import { SyncIndicator, type StorySaveStatus } from '../story/SyncIndicator';

interface EditorToolbarActionsProps {
  loadLabel?: string;
  commentAccess: boolean;
  commentsOpen: boolean;
  openCommentCount: number;
  onToggleComments: () => void;
  reviewOnly: boolean;
  readerPath: string;
  saveStatus: StorySaveStatus;
  realtimeStatus: StoryRealtimeStatus;
  simulationFromStartPath: string;
  simulationPath: string;
  hasCurrentSimulationTarget: boolean;
}

export function EditorToolbarActions(props: EditorToolbarActionsProps) {
  return (
    <div className="actions editor-toolbar-actions">
      <ToolbarStatusActions {...props} />
      <ToolbarNavigationActions {...props} />
    </div>
  );
}

function ToolbarStatusActions({
  loadLabel,
  commentAccess,
  commentsOpen,
  openCommentCount,
  onToggleComments,
  reviewOnly,
  saveStatus,
  realtimeStatus,
}: EditorToolbarActionsProps) {
  return (
    <>
      {loadLabel !== undefined && loadLabel.length > 0 ? (
        <span className="save-status saving" role="status" aria-live="polite">
          {loadLabel}
        </span>
      ) : null}
      {commentAccess ? (
        <CommentsButton
          commentsOpen={commentsOpen}
          openCommentCount={openCommentCount}
          onToggleComments={onToggleComments}
        />
      ) : null}
      {!reviewOnly ? (
        <SyncIndicator saveStatus={saveStatus} realtimeStatus={realtimeStatus} />
      ) : null}
    </>
  );
}

function CommentsButton({
  commentsOpen,
  openCommentCount,
  onToggleComments,
}: Pick<EditorToolbarActionsProps, 'commentsOpen' | 'openCommentCount' | 'onToggleComments'>) {
  const { t } = useTranslation();
  return (
    <button
      className={`canvas-tool-action editor-toolbar-icon-action comments-toolbar-button ${
        commentsOpen ? 'active' : ''
      }`}
      type="button"
      aria-label={t('comments.title')}
      aria-pressed={commentsOpen}
      data-tooltip={t('comments.title')}
      title={t('comments.title')}
      onClick={onToggleComments}
    >
      <CanvasActionIcon name="comments" />
      {openCommentCount ? <small>{openCommentCount}</small> : null}
    </button>
  );
}

function ToolbarNavigationActions({
  reviewOnly,
  readerPath,
  simulationFromStartPath,
  simulationPath,
  hasCurrentSimulationTarget,
}: EditorToolbarActionsProps) {
  const { t } = useTranslation();
  if (reviewOnly) {
    return (
      <Link className="button secondary" to={readerPath}>
        {t('editor.openReader')}
      </Link>
    );
  }

  return (
    <>
      <Link
        className="button canvas-tool-action editor-toolbar-icon-action"
        aria-label={t('editor.testFromStart')}
        data-tooltip={t('editor.testFromStart')}
        title={t('editor.testFromStart')}
        data-onboarding-target="simulation-launch"
        to={simulationFromStartPath}
      >
        <CanvasActionIcon name="play" />
      </Link>
      {hasCurrentSimulationTarget ? (
        <Link
          className="button canvas-tool-action editor-toolbar-icon-action"
          aria-label={t('editor.testFromCurrent')}
          data-tooltip={t('editor.testFromCurrent')}
          title={t('editor.testFromCurrent')}
          to={simulationPath}
        >
          <CanvasActionIcon name="playFromInteraction" />
        </Link>
      ) : null}
    </>
  );
}
