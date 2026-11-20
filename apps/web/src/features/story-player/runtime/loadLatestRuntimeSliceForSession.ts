import type { ReaderProgressState, Story } from '@paralleax/shared';
import { loadStoryRuntimeSlice } from '../storyRuntimeLoader';

export async function loadLatestRuntimeSliceForSession(
  runtimeStory: Story,
  getCurrentSession: () => ReaderProgressState,
): Promise<Story> {
  let latestSession = getCurrentSession();
  let requestedSession: ReaderProgressState;
  let nextStory: Story;
  do {
    requestedSession = latestSession;
    nextStory = await loadStoryRuntimeSlice(
      runtimeStory,
      requestedSession.currentInteractionId,
      requestedSession.journeyInteractionIds,
    );
    latestSession = getCurrentSession();
  } while (!hasSameRuntimeSliceRequest(requestedSession, latestSession));
  return nextStory;
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
