import { useCallback, useEffect, useState } from 'react';
import type { TFunction } from 'i18next';
import { apiErrorMessage } from '../../../apiErrorMessages';
import { loadStoryPlayerRuntime } from '../loadStoryPlayerRuntime';
import type { StoryPlayerRuntimeLoadResult } from '../loadStoryPlayerRuntime';

export function useStoryPlayerLoading({
  loadKey,
  storyId,
  authenticated,
  simulationRequested,
  requestedStartInteractionId,
  onLoaded,
  recoverFromStoryAccessError,
  t,
}: {
  loadKey: string;
  storyId: string;
  authenticated: boolean;
  simulationRequested: boolean;
  requestedStartInteractionId: string | null;
  onLoaded: (
    result: StoryPlayerRuntimeLoadResult,
    markLoaded: () => void,
    requestKey: string,
  ) => void;
  recoverFromStoryAccessError: (caught: unknown) => boolean;
  t: TFunction;
}) {
  const [loadedKey, setLoadedKey] = useState('');
  const [loadError, setLoadError] = useState<{ key: string; message: string }>();
  const [loadAttempt, setLoadAttempt] = useState(0);

  const retry = useCallback(() => {
    setLoadAttempt((attempt) => attempt + 1);
  }, []);
  const clearError = useCallback(() => {
    setLoadError(undefined);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadStoryPlayerRuntime({
      storyId,
      authenticated,
      simulationRequested,
      requestedStartInteractionId,
    })
      .then((result) => {
        if (cancelled) return;
        onLoaded(result, () => setLoadedKey(loadKey), loadKey);
      })
      .catch((caught: unknown) => {
        if (cancelled || recoverFromStoryAccessError(caught)) return;
        setLoadError({
          key: loadKey,
          message: apiErrorMessage(caught, t, t('player.loadFailed')),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [
    authenticated,
    loadAttempt,
    loadKey,
    onLoaded,
    recoverFromStoryAccessError,
    requestedStartInteractionId,
    simulationRequested,
    storyId,
    t,
  ]);

  return { loadedKey, loadError, retry, clearError };
}
