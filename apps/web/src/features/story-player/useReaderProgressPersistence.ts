import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
  type RefObject,
} from 'react';
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
  const { status, markLoaded, enqueuePersistence } = useReaderProgressQueue(
    displayScope,
    authenticated,
    mode,
    storyId,
  );

  const save = useCallback(
    (session: ReaderProgressState, modeOverride?: ReaderAutosaveMode) => {
      if (!authenticated) {
        return;
      }
      const persistenceMode = modeOverride ?? mode;
      const queueScope = `${storyId}:${persistenceMode}`;
      enqueuePersistence(
        queueScope,
        () => api.saveReaderProgress(storyId, buildReaderProgressPayload(session), persistenceMode),
        'saved',
      );
    },
    [authenticated, enqueuePersistence, mode, storyId],
  );

  const reset = useCallback(() => {
    if (!authenticated) {
      return;
    }
    const queueScope = `${storyId}:${mode}`;
    enqueuePersistence(queueScope, () => api.deleteReaderProgress(storyId, mode), 'idle');
  }, [authenticated, enqueuePersistence, mode, storyId]);

  return { status, markLoaded, save, reset };
}

function useReaderProgressQueue(
  displayScope: string,
  authenticated: boolean,
  mode: ReaderAutosaveMode,
  storyId: string,
) {
  const [scopedStatus, setScopedStatus] = useState<ScopedReaderProgressStatus>({
    scope: displayScope,
    value: 'idle',
  });
  const saveQueuesRef = useRef(new Map<string, Promise<void>>());
  const attemptsRef = useRef(new Map<string, number>());
  const lifecycleVersionRef = useRef(0);
  useReaderProgressLifecycle({
    saveQueuesRef,
    attemptsRef,
    lifecycleVersionRef,
    authenticated,
    mode,
    storyId,
  });

  const markLoaded = useCallback(
    (hasSavedProgress: boolean) => {
      setScopedStatus({ scope: displayScope, value: hasSavedProgress ? 'saved' : 'idle' });
    },
    [displayScope],
  );

  const enqueuePersistence = useReaderProgressEnqueue({
    attemptsRef,
    displayScope,
    lifecycleVersionRef,
    saveQueuesRef,
    setScopedStatus,
  });

  const status = scopedStatus.scope === displayScope ? scopedStatus.value : 'idle';
  return { status, markLoaded, enqueuePersistence };
}

function buildReaderProgressPayload(session: ReaderProgressState) {
  return {
    journeyInteractionIds: session.journeyInteractionIds,
    ownedItemIds: session.ownedItemIds,
    ...(session.randomSeed !== undefined && session.randomSeed !== ''
      ? { randomSeed: session.randomSeed }
      : {}),
    ...(session.stepStartedAt ? { stepStartedAt: session.stepStartedAt } : {}),
  };
}

type ReaderProgressLifecycle = {
  saveQueuesRef: RefObject<Map<string, Promise<void>>>;
  attemptsRef: RefObject<Map<string, number>>;
  lifecycleVersionRef: RefObject<number>;
  authenticated: boolean;
  mode: ReaderAutosaveMode;
  storyId: string;
};

function useReaderProgressLifecycle({
  saveQueuesRef,
  attemptsRef,
  lifecycleVersionRef,
  authenticated,
  mode,
  storyId,
}: ReaderProgressLifecycle) {
  useEffect(() => {
    lifecycleVersionRef.current += 1;
    saveQueuesRef.current = new Map();
    attemptsRef.current = new Map();
    return () => {
      lifecycleVersionRef.current += 1;
    };
  }, [attemptsRef, authenticated, lifecycleVersionRef, mode, saveQueuesRef, storyId]);
}

function useReaderProgressEnqueue({
  attemptsRef,
  displayScope,
  lifecycleVersionRef,
  saveQueuesRef,
  setScopedStatus,
}: {
  attemptsRef: RefObject<Map<string, number>>;
  displayScope: string;
  lifecycleVersionRef: RefObject<number>;
  saveQueuesRef: RefObject<Map<string, Promise<void>>>;
  setScopedStatus: Dispatch<SetStateAction<ScopedReaderProgressStatus>>;
}) {
  return useCallback(
    (
      queueScope: string,
      operation: () => Promise<unknown>,
      completedStatus: ReaderProgressStatus,
    ) => {
      const currentLifecycleVersion = lifecycleVersionRef.current;
      const currentAttempt = (attemptsRef.current.get(displayScope) ?? 0) + 1;
      attemptsRef.current.set(displayScope, currentAttempt);
      setScopedStatus({ scope: displayScope, value: 'saving' });
      const updateStatus = (value: ReaderProgressStatus) => {
        if (currentLifecycleVersion !== lifecycleVersionRef.current) {
          return;
        }
        if (currentAttempt !== attemptsRef.current.get(displayScope)) {
          return;
        }
        setScopedStatus((current) =>
          current.scope === displayScope ? { scope: displayScope, value } : current,
        );
      };
      const queued = (saveQueuesRef.current.get(queueScope) ?? Promise.resolve()).then(operation);
      const settled = queued.then(
        () => {
          updateStatus(completedStatus);
        },
        () => {
          updateStatus('error');
        },
      );
      saveQueuesRef.current.set(queueScope, settled);
    },
    [attemptsRef, displayScope, lifecycleVersionRef, saveQueuesRef, setScopedStatus],
  );
}
