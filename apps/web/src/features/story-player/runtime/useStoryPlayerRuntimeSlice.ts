import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { TFunction } from 'i18next';
import type { Story } from '@paralleax/shared';
import { apiErrorMessage } from '../../../apiErrorMessages';
import { loadStoryRuntimeSlice } from '../storyRuntimeLoader';

interface RuntimeOptionsFailure {
  key: string;
  message: string;
}

export function useStoryPlayerRuntimeSlice({
  story,
  currentInteractionId,
  journeyInteractionIds,
  routeLoaded,
  setStory,
  recoverFromStoryAccessError,
  t,
}: {
  story: Story | undefined;
  currentInteractionId: string | null;
  journeyInteractionIds: string[];
  routeLoaded: boolean;
  setStory: Dispatch<SetStateAction<Story | undefined>>;
  recoverFromStoryAccessError: (caught: unknown) => boolean;
  t: TFunction;
}) {
  const [runtimeSliceKey, setRuntimeSliceKey] = useState('');
  const [runtimeOptionsFailure, setRuntimeOptionsFailure] = useState<RuntimeOptionsFailure>();
  const requestedRuntimeSliceKey = story
    ? runtimeStateKey(story, currentInteractionId, journeyInteractionIds)
    : '';
  const runtimeOptionsError =
    runtimeOptionsFailure?.key === requestedRuntimeSliceKey ? runtimeOptionsFailure.message : '';
  const runtimeSliceMatchesRequest = Boolean(story && runtimeSliceKey === requestedRuntimeSliceKey);
  const runtimeSliceReady = runtimeSliceMatchesRequest && !runtimeOptionsError;

  const markRuntimeSliceLoaded = useCallback(
    (
      loadedStory: Pick<Story, 'revision'>,
      loadedCurrentInteractionId: string | null,
      loadedJourneyInteractionIds: readonly string[],
      { clearFailure = true }: { clearFailure?: boolean } = {},
    ) => {
      setRuntimeSliceKey(
        runtimeStateKey(loadedStory, loadedCurrentInteractionId, loadedJourneyInteractionIds),
      );
      if (clearFailure) setRuntimeOptionsFailure(undefined);
    },
    [],
  );

  useEffect(() => {
    if (!story || !routeLoaded || runtimeSliceMatchesRequest) return;
    let cancelled = false;
    void loadStoryRuntimeSlice(story, currentInteractionId, journeyInteractionIds)
      .then((nextStory) => {
        if (cancelled) return;
        setStory(nextStory);
        markRuntimeSliceLoaded(nextStory, currentInteractionId, journeyInteractionIds);
      })
      .catch((caught: unknown) => {
        if (cancelled || recoverFromStoryAccessError(caught)) return;
        setRuntimeOptionsFailure({
          key: requestedRuntimeSliceKey,
          message: apiErrorMessage(caught, t, t('player.loadFailed')),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [
    currentInteractionId,
    journeyInteractionIds,
    markRuntimeSliceLoaded,
    recoverFromStoryAccessError,
    requestedRuntimeSliceKey,
    routeLoaded,
    runtimeSliceMatchesRequest,
    setStory,
    story,
    t,
  ]);

  return {
    markRuntimeSliceLoaded,
    runtimeOptionsError,
    runtimeSliceMatchesRequest,
    runtimeSliceReady,
  };
}

function runtimeStateKey(
  story: Pick<Story, 'revision'>,
  currentInteractionId: string | null,
  journeyInteractionIds: readonly string[],
) {
  return `${story.revision ?? 1}:${currentInteractionId ?? 'start'}:${journeyInteractionIds.join(',')}`;
}
