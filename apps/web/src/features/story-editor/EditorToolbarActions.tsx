import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CanvasActionIcon } from '../../components/StoryCanvasToolbar';
import type { StoryRealtimeStatus } from '../realtime/storyRealtime';

type StorySaveStatus = 'idle' | 'saving' | 'saved' | 'error';

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

export function EditorToolbarActions({
  loadLabel,
  commentAccess,
  commentsOpen,
  openCommentCount,
  onToggleComments,
  reviewOnly,
  readerPath,
  saveStatus,
  realtimeStatus,
  simulationFromStartPath,
  simulationPath,
  hasCurrentSimulationTarget,
}: EditorToolbarActionsProps) {
  const { t } = useTranslation();
  const syncLabel =
    saveStatus === 'error'
      ? t('editor.saveFailed')
      : saveStatus === 'saving'
        ? t('editor.saving')
        : t(`editor.realtime.${realtimeStatus}`);
  const syncIcon = getSyncIcon(saveStatus, realtimeStatus);
  const syncState = getSyncState(saveStatus, realtimeStatus);

  return (
    <div className="actions editor-toolbar-actions">
      {loadLabel ? (
        <span className="save-status saving" role="status" aria-live="polite">
          {loadLabel}
        </span>
      ) : null}
      {commentAccess ? (
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
      ) : null}
      {!reviewOnly ? (
        <span
          className={`editor-sync-indicator ${syncState}`}
          role="status"
          aria-label={syncLabel}
          aria-live="polite"
          data-tooltip={syncLabel}
          title={syncLabel}
          tabIndex={0}
        >
          <CanvasActionIcon name={syncIcon} />
        </span>
      ) : null}
      {reviewOnly ? (
        <Link className="button secondary" to={readerPath}>
          {t('editor.openReader')}
        </Link>
      ) : (
        <>
          <Link
            className="canvas-tool-action editor-toolbar-icon-action"
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
              className="canvas-tool-action editor-toolbar-icon-action"
              aria-label={t('editor.testFromCurrent')}
              data-tooltip={t('editor.testFromCurrent')}
              title={t('editor.testFromCurrent')}
              to={simulationPath}
            >
              <CanvasActionIcon name="playFromInteraction" />
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
}

function getSyncIcon(
  saveStatus: StorySaveStatus,
  realtimeStatus: StoryRealtimeStatus,
): 'syncSaved' | 'syncSaving' | 'syncOffline' | 'syncError' {
  if (saveStatus === 'error') return 'syncError';
  if (saveStatus === 'saving') return 'syncSaving';
  return realtimeStatus === 'live' ? 'syncSaved' : 'syncOffline';
}

function getSyncState(
  saveStatus: StorySaveStatus,
  realtimeStatus: StoryRealtimeStatus,
): 'saved' | 'saving' | 'reconnecting' | 'unavailable' | 'error' {
  if (saveStatus === 'error') return 'error';
  if (saveStatus === 'saving') return 'saving';
  if (realtimeStatus === 'live') return 'saved';
  return realtimeStatus;
}

