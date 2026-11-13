import type { ReaderProgressState, Story } from '@paralleax/shared';
import { loadStoryRuntimeSlice } from '../storyRuntimeLoader';

export async function loadLatestRuntimeSliceForSession(
  runtimeStory: Story,
  getCurrentSession: () => ReaderProgressState,
): Promise<Story> {
  let requestedSession = getCurrentSession();
  while (true) {
    const nextStory = await loadStoryRuntimeSlice(
      runtimeStory,
      requestedSession.currentInteractionId,
      requestedSession.journeyInteractionIds,
    );
    const latestSession = getCurrentSession();
    if (hasSameRuntimeSliceRequest(requestedSession, latestSession)) {
      return nextStory;
    }
    requestedSession = latestSession;
  }
}

function hasSameRuntimeSliceRequest(
  first: ReaderProgressState,
  second: ReaderProgressState,
): boolean {
  return (
    first.currentInteractionId === second.currentInteractionId &&
    first.journeyInteractionIds.length === second.journeyInteractionIds.length &&
    first.journeyInteractionIds.every((id, index) => id === second.journeyInteractionIds[index])
  );
}
