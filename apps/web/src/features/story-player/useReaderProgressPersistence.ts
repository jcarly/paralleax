import { useCallback, useRef, useState } from 'react';
import type { ReaderProgressState } from '@paralleax/shared';
import { api } from '../../api';

export type ReaderProgressStatus = 'idle' | 'saving' | 'saved' | 'error';

export function useReaderProgressPersistence({
  authenticated,
  storyId,
}: {
  authenticated: boolean;
  storyId: string;
}) {
  const [status, setStatus] = useState<ReaderProgressStatus>('idle');
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const attempt = useRef(0);

  const markLoaded = useCallback((hasSavedProgress: boolean) => {
    setStatus(hasSavedProgress ? 'saved' : 'idle');
  }, []);

  const save = useCallback(
    (session: ReaderProgressState) => {
      if (!authenticated) return;
      const currentAttempt = ++attempt.current;
      setStatus('saving');
      const operation = saveQueue.current
        .then(() =>
          api.saveReaderProgress(storyId, {
            journeyInteractionIds: session.journeyInteractionIds,
            ownedItemIds: session.ownedItemIds,
          }),
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
    const currentAttempt = ++attempt.current;
    setStatus('saving');
    const operation = saveQueue.current
      .then(() => api.deleteReaderProgress(storyId))
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
