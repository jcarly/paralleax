import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker, type Location } from 'react-router-dom';
import { RichTextEditorDialog } from '../components/RichTextEditorDialog';

type GuardedSurface = 'editor' | 'player';

function playerSessionKey(location: Pick<Location, 'pathname' | 'search'>) {
  const params = new URLSearchParams(location.search);
  const simulation = params.get('mode') === 'simulation';
  return `${simulation ? 'simulation' : 'reader'}:${simulation ? (params.get('startInteractionId') ?? '') : ''}`;
}

export function leavesPendingSaveSurface(
  currentLocation: Pick<Location, 'pathname' | 'search'>,
  nextLocation: Pick<Location, 'pathname' | 'search'>,
  surface: GuardedSurface,
) {
  if (currentLocation.pathname !== nextLocation.pathname) return true;
  return (
    surface === 'player' && playerSessionKey(currentLocation) !== playerSessionKey(nextLocation)
  );
}

export function usePendingSaveGuard(shouldBlock: boolean, surface: GuardedSurface) {
  const { t } = useTranslation();
  const stayButton = useRef<HTMLButtonElement>(null);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      shouldBlock && leavesPendingSaveSurface(currentLocation, nextLocation, surface),
  );

  useEffect(() => {
    if (blocker.state === 'blocked') stayButton.current?.focus();
  }, [blocker.state]);

  useEffect(() => {
    if (!shouldBlock) return;
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventUnload);
    return () => window.removeEventListener('beforeunload', preventUnload);
  }, [shouldBlock]);

  if (blocker.state !== 'blocked') return null;
  return (
    <RichTextEditorDialog
      title={t('pendingSave.title')}
      description={t('pendingSave.description')}
      closeLabel={t('pendingSave.close')}
      onCancel={() => blocker.reset()}
    >
      <div className="modal-dialog-actions">
        <button ref={stayButton} type="button" onClick={() => blocker.reset()}>
          {t('pendingSave.stay')}
        </button>
        <button type="button" onClick={() => blocker.proceed()}>
          {t('pendingSave.leave')}
        </button>
      </div>
    </RichTextEditorDialog>
  );
}
