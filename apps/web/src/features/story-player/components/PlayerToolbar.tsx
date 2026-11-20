import type { Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { ReaderProgressStatus } from '../useReaderProgressPersistence';
import type { SimulationMutationStatus } from '../useSimulationMutationPersistence';
import type { StoryRealtimeStatus } from '../../realtime/storyRealtime';
import { SyncIndicator } from '../../story/SyncIndicator';

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
        <SyncIndicator
          saveStatus={simulationMutations.status}
          realtimeStatus={storyRealtimeStatus}
        />
      ) : null}
      {isSimulationMode && simulationMutations.status === 'error' ? (
        <div className="simulation-save-feedback error" role="alert" aria-live="polite">
          <span>{t('player.storyChangesSaveFailed')}</span>
          <small>{simulationMutations.error}</small>
          {simulationMutations.canRetry ? (
            <button type="button" onClick={simulationMutations.retry}>
              {t('player.retryStoryChanges')}
            </button>
          ) : null}
          <button type="button" onClick={() => void onReloadAfterSimulationFailure()}>
            {t('player.reloadStoryAfterSaveFailure')}
          </button>
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
