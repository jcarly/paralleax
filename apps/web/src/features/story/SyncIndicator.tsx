import { useTranslation } from 'react-i18next';
import { CanvasActionIcon } from '../../components/StoryCanvasToolbar';
import type { StoryRealtimeStatus } from '../realtime/storyRealtime';

export type StorySaveStatus = 'idle' | 'saving' | 'saved' | 'error';

function getSyncIcon(
  saveStatus: StorySaveStatus,
  realtimeStatus: StoryRealtimeStatus,
): 'syncSaved' | 'syncSaving' | 'syncOffline' | 'syncError' {
  if (saveStatus === 'error') {
    return 'syncError';
  }
  if (saveStatus === 'saving') {
    return 'syncSaving';
  }
  return realtimeStatus === 'live' ? 'syncSaved' : 'syncOffline';
}

function getSyncState(
  saveStatus: StorySaveStatus,
  realtimeStatus: StoryRealtimeStatus,
): 'saved' | 'saving' | 'reconnecting' | 'unavailable' | 'error' {
  if (saveStatus === 'error') {
    return 'error';
  }
  if (saveStatus === 'saving') {
    return 'saving';
  }
  if (realtimeStatus === 'live') {
    return 'saved';
  }
  return realtimeStatus;
}

/**
 * One icon for saving and live-update state, with its meaning in an accessible
 * label and tooltip. Shared by the editor toolbar and Simulation.
 */
export function SyncIndicator({
  saveStatus,
  realtimeStatus,
}: {
  saveStatus: StorySaveStatus;
  realtimeStatus: StoryRealtimeStatus;
}) {
  const { t } = useTranslation();
  const label =
    saveStatus === 'error'
      ? t('editor.saveFailed')
      : saveStatus === 'saving'
        ? t('editor.saving')
        : t(`editor.realtime.${realtimeStatus}`);
  return (
    <span
      className={`editor-sync-indicator ${getSyncState(saveStatus, realtimeStatus)}`}
      role="status"
      aria-label={label}
      aria-live="polite"
      data-tooltip={label}
      title={label}
    >
      <CanvasActionIcon name={getSyncIcon(saveStatus, realtimeStatus)} />
    </span>
  );
}
