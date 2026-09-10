import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReaderAutosaveMode, ReaderProgressState } from '@paralleax/shared';
import { api } from '../../api';

export type ReaderProgressStatus = 'idle' | 'saving' | 'saved' | 'error';

interface ScopedReaderProgressStatus {
  scope: string;
  value: ReaderProgressStatus;
}

export function useReaderProgressPersistence({
  authenticated,
  storyId,
  mode = 'reader',
}: {
  authenticated: boolean;
  storyId: string;
  mode?: ReaderAutosaveMode;
}) {
  const displayScope = `${authenticated ? 'authenticated' : 'anonymous'}:${storyId}:${mode}`;
  const [scopedStatus, setScopedStatus] = useState<ScopedReaderProgressStatus>({
    scope: displayScope,
    value: 'idle',
  });
  const saveQueues = useRef(new Map<string, Promise<void>>());
  const attempts = useRef(new Map<string, number>());
  const lifecycleVersion = useRef(0);
  const status = scopedStatus.scope === displayScope ? scopedStatus.value : 'idle';
  useEffect(() => {
    lifecycleVersion.current += 1;
    saveQueues.current = new Map();
    attempts.current = new Map();
    return () => {
      lifecycleVersion.current += 1;
    };
  }, [authenticated, mode, storyId]);

  const markLoaded = useCallback(
    (hasSavedProgress: boolean) => {
      setScopedStatus({ scope: displayScope, value: hasSavedProgress ? 'saved' : 'idle' });
    },
    [displayScope],
  );

  const enqueuePersistence = useCallback(
    (
      queueScope: string,
      operation: () => Promise<unknown>,
      completedStatus: ReaderProgressStatus,
    ) => {
      const currentLifecycleVersion = lifecycleVersion.current;
      const currentAttempt = (attempts.current.get(displayScope) ?? 0) + 1;
      attempts.current.set(displayScope, currentAttempt);
      setScopedStatus({ scope: displayScope, value: 'saving' });
      const updateStatus = (value: ReaderProgressStatus) => {
        if (currentLifecycleVersion !== lifecycleVersion.current) return;
        if (currentAttempt !== attempts.current.get(displayScope)) return;
        setScopedStatus((current) =>
          current.scope === displayScope ? { scope: displayScope, value } : current,
        );
      };
      const queued = (saveQueues.current.get(queueScope) ?? Promise.resolve()).then(operation);
      const settled = queued.then(
        () => updateStatus(completedStatus),
        () => updateStatus('error'),
      );
      saveQueues.current.set(queueScope, settled);
    },
    [displayScope],
  );

  const save = useCallback(
    (session: ReaderProgressState, modeOverride?: ReaderAutosaveMode) => {
      if (!authenticated) return;
      const persistenceMode = modeOverride ?? mode;
      const queueScope = `${storyId}:${persistenceMode}`;
      enqueuePersistence(
        queueScope,
        () =>
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
        'saved',
      );
    },
    [authenticated, enqueuePersistence, mode, storyId],
  );

  const reset = useCallback(() => {
    if (!authenticated) return;
    const queueScope = `${storyId}:${mode}`;
    enqueuePersistence(queueScope, () => api.deleteReaderProgress(storyId, mode), 'idle');
  }, [authenticated, enqueuePersistence, mode, storyId]);

  return { status, markLoaded, save, reset };
}
