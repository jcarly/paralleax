import { useEffect, useRef } from 'react';
import type { StorySummary } from '@paralleax/shared';
import type { StoryDeletionResult } from './useStoryListMutations';

export type StoryRemoval = (id: string) => Promise<StoryDeletionResult>;

/**
 * A deleted Story takes the dialog's opener with it. Keep keyboard focus in the
 * list by moving it to the results region once the card has left the DOM.
 */
export function useStoryGridFocus(stories: StorySummary[], removeStory: StoryRemoval) {
  const regionRef = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  useEffect(() => {
    if (refocus.current) {
      refocus.current = false;
      regionRef.current?.focus();
    }
  }, [stories]);
  const removeAndRefocus = async (id: string) => {
    // Armed before the call: the list updates inside `removeStory`, before it resolves.
    refocus.current = true;
    const result = await removeStory(id);
    refocus.current = result.status === 'deleted';
    return result;
  };
  return {
    focusProps: { ref: regionRef, tabIndex: -1, className: 'library-results' },
    removeAndRefocus,
  };
}
