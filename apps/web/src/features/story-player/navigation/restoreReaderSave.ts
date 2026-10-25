import type { ReaderProgressState, ReaderSave, Story } from '@paralleax/shared';
import { loadStoryRuntimeSlice } from '../storyRuntimeLoader';

type ReplayReaderSession = (
  story: Story,
  journeyInteractionIds: string[],
  ownedItemIds: string[],
  randomSeed: string,
  stepStartedAt?: string[],
) => ReaderProgressState;

export async function restoreReaderSave({
  story,
  save,
  randomSeed,
  replaySession,
}: {
  story: Story;
  save: ReaderSave;
  randomSeed: string;
  replaySession: ReplayReaderSession;
}): Promise<{ story: Story; session: ReaderProgressState }> {
  const journeyInteractionIds = save.state.journeyInteractionIds;
  const restoredStory = await loadStoryRuntimeSlice(
    story,
    journeyInteractionIds.at(-1) ?? null,
    journeyInteractionIds,
  );
  const session = replaySession(
    restoredStory,
    journeyInteractionIds,
    save.state.ownedItemIds,
    randomSeed,
    save.state.stepStartedAt,
  );

  return { story: restoredStory, session };
}
