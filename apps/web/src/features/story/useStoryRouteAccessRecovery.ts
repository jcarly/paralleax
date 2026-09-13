import { useCallback, useState } from 'react';
import { isStoryRouteInaccessibleError } from './storyApiErrors';

export function useStoryRouteAccessRecovery(storyId: string) {
  const [inaccessibleStoryId, setInaccessibleStoryId] = useState<string>();

  const markStoryInaccessible = useCallback(() => {
    setInaccessibleStoryId(storyId);
  }, [storyId]);

  const recoverFromStoryAccessError = useCallback(
    (caught: unknown): boolean => {
      if (!isStoryRouteInaccessibleError(caught)) return false;
      markStoryInaccessible();
      return true;
    },
    [markStoryInaccessible],
  );

  return {
    storyRouteInaccessible: inaccessibleStoryId === storyId,
    markStoryInaccessible,
    recoverFromStoryAccessError,
  };
}
