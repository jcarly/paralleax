import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ReaderProgressStatus } from '../useReaderProgressPersistence';
import type { SimulationMutationStatus } from '../useSimulationMutationPersistence';
import type { StoryRealtimeStatus } from '../../realtime/storyRealtime';

type SimulationMutationFeedback = {
  status: SimulationMutationStatus;
  error: string;
  canRetry: boolean;
  retry: () => void;
};

export function PlayerToolbar({
  storyId,
  storyTitle,
  canEditStory,
  isSimulationMode,
  storyRealtimeStatus,
  simulationMutations,
  onReloadAfterSimulationFailure,
  authenticated,
  progressStatus,
  savesDialogTrigger,
  onOpenSaves,
  canStepBack,
  onStepBack,
  onRestart,
  canUseReaderComments,
  commentsOpen,
  openCommentCount,
  onToggleComments,
}: {
  storyId: string;
  storyTitle: string;
  canEditStory: boolean;
  isSimulationMode: boolean;
  storyRealtimeStatus: StoryRealtimeStatus;
  simulationMutations: SimulationMutationFeedback;
  onReloadAfterSimulationFailure: () => void | Promise<void>;
  authenticated: boolean;
  progressStatus: ReaderProgressStatus;
  savesDialogTrigger: Ref<HTMLButtonElement>;
  onOpenSaves: () => void;
  canStepBack: boolean;
  onStepBack: () => void;
  onRestart: () => void;
  canUseReaderComments: boolean;
  commentsOpen: boolean;
  openCommentCount: number;
  onToggleComments: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="player-top">
      <div className="player-context">
        <span className="player-mark" aria-hidden="true">
          P
        </span>
        <span>
          <b>{storyTitle}</b>
        </span>
      </div>
      {isSimulationMode ? <span className="mode-pill">{t('player.simulation')}</span> : null}
      {isSimulationMode ? (
        <span
          className={`story-realtime-status ${storyRealtimeStatus}`}
          role="status"
          aria-live="polite"
        >
          <span className={`realtime-status-dot ${storyRealtimeStatus}`} aria-hidden="true" />
          {t(`player.realtime.${storyRealtimeStatus}`)}
        </span>
      ) : null}
      {isSimulationMode && simulationMutations.status !== 'idle' ? (
        <div
          className={`simulation-save-feedback ${simulationMutations.status}`}
          role={simulationMutations.status === 'error' ? 'alert' : 'status'}
          aria-live="polite"
        >
          <span>
            {simulationMutations.status === 'saving'
              ? t('player.savingStoryChanges')
              : simulationMutations.status === 'saved'
                ? t('player.storyChangesSaved')
                : t('player.storyChangesSaveFailed')}
          </span>
          {simulationMutations.status === 'error' ? (
            <>
              <small>{simulationMutations.error}</small>
              {simulationMutations.canRetry ? (
                <button type="button" onClick={simulationMutations.retry}>
                  {t('player.retryStoryChanges')}
                </button>
              ) : null}
              <button type="button" onClick={() => void onReloadAfterSimulationFailure()}>
                {t('player.reloadStoryAfterSaveFailure')}
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {authenticated ? (
        <span className={`save-status ${progressStatus}`} role="status" aria-live="polite">
          {progressStatus === 'saving'
            ? t('player.savingProgress')
            : progressStatus === 'saved'
              ? t('player.progressSaved')
              : progressStatus === 'error'
                ? t('player.progressSaveFailed')
                : ''}
        </span>
      ) : !isSimulationMode ? (
        <span className="save-status">{t('player.signInToSave')}</span>
      ) : null}
      {authenticated ? (
        <button
          ref={savesDialogTrigger}
          className="player-toolbar-button"
          type="button"
          onClick={onOpenSaves}
        >
          {t('player.saves.open')}
        </button>
      ) : null}
      {isSimulationMode ? (
        <button className="player-toolbar-button" disabled={!canStepBack} onClick={onStepBack}>
          <span aria-hidden="true">←</span> {t('player.back')}
        </button>
      ) : null}
      <button className="player-toolbar-button" onClick={onRestart}>
        <span aria-hidden="true">↻</span> {t('player.restart')}
      </button>
      {canUseReaderComments ? (
        <button
          className={`player-toolbar-button comments-toolbar-button ${commentsOpen ? 'active' : ''}`}
          type="button"
          onClick={onToggleComments}
        >
          {t('comments.title')}
          {openCommentCount ? <small>{openCommentCount}</small> : null}
        </button>
      ) : null}
      {canEditStory ? (
        <Link className="player-exit" to={`/stories/${storyId}/edit`}>
          {t(isSimulationMode ? 'player.exitSimulation' : 'player.backToEditor')}
        </Link>
      ) : null}
    </div>
  );
}
