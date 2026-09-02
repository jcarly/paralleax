import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReaderAutosaveMode, ReaderProgressState } from '@paralleax/shared';
import { api } from '../../api';

export type ReaderProgressStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useReaderProgressPersistence({
  authenticated,
  storyId,
  mode = 'reader',
}: {
  authenticated: boolean;
  storyId: string;
  mode?: ReaderAutosaveMode;
}) {
  const [status, setStatus] = useState<ReaderProgressStatus>('idle');
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const attempt = useRef(0);
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const markLoaded = useCallback((hasSavedProgress: boolean) => {
    setStatus(hasSavedProgress ? 'saved' : 'idle');
  }, []);

  const save = useCallback(
    (session: ReaderProgressState, modeOverride?: ReaderAutosaveMode) => {
      if (!authenticated) return;
      const persistenceMode = modeOverride ?? modeRef.current;
      const currentAttempt = ++attempt.current;
      setStatus('saving');
      const operation = saveQueue.current
        .then(() =>
          api.saveReaderProgress(
            storyId,
            {
              journeyInteractionIds: session.journeyInteractionIds,
              ownedItemIds: session.ownedItemIds,
              ...(session.randomSeed ? { randomSeed: session.randomSeed } : {}),
              ...(session.stepStartedAt ? { stepStartedAt: session.stepStartedAt } : {}),
            },
            persistenceMode,
          ),
        )
        .then(() => {
          if (currentAttempt === attempt.current) setStatus('saved');
        })
        .catch(() => {
          if (currentAttempt === attempt.current) setStatus('error');
        });
      saveQueue.current = operation.then(() => undefined);
    },
    [authenticated, storyId],
  );

  const reset = useCallback(() => {
    if (!authenticated) return;
    const persistenceMode = modeRef.current;
    const currentAttempt = ++attempt.current;
    setStatus('saving');
    const operation = saveQueue.current
      .then(() => api.deleteReaderProgress(storyId, persistenceMode))
      .then(() => {
        if (currentAttempt === attempt.current) setStatus('idle');
      })
      .catch(() => {
        if (currentAttempt === attempt.current) setStatus('error');
      });
    saveQueue.current = operation.then(() => undefined);
  }, [authenticated, storyId]);

  return { status, markLoaded, save, reset };
}
