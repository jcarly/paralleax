import type { ReaderAutosaveMode, Story } from '@paralleax/shared';
import { ensureStoryInteractionPositions } from '@paralleax/shared';
import { api } from '../../api';
import { loadStoryRuntimeContext, loadStoryRuntimeSlice } from './storyRuntimeLoader';

export interface StoryPlayerRuntimeLoadResult {
  positioned: Story;
  progress: Awaited<ReturnType<typeof api.getReaderProgress>>;
  effectiveStartInteractionId: string | null;
  loadedProgressMode: ReaderAutosaveMode;
}

export async function loadStoryPlayerRuntime({
  storyId,
  authenticated,
  simulationRequested,
  requestedStartInteractionId,
}: {
  storyId: string;
  authenticated: boolean;
  simulationRequested: boolean;
  requestedStartInteractionId: string | null;
}): Promise<StoryPlayerRuntimeLoadResult> {
  const bootstrap = await api.getStoryRuntimeBootstrap(storyId);
  const authorizedSimulation = simulationRequested && bootstrap.capabilities?.canEdit === true;
  const loadedProgressMode: ReaderAutosaveMode = authorizedSimulation ? 'simulation' : 'reader';
  const effectiveStartInteractionId = authorizedSimulation ? requestedStartInteractionId : null;
  const [runtimeStory, progress] = await Promise.all([
    loadStoryRuntimeContext(storyId, bootstrap),
    !authenticated || (authorizedSimulation && effectiveStartInteractionId)
      ? Promise.resolve(null)
      : api.getReaderProgress(storyId, loadedProgressMode),
  ]);
  const journeyInteractionIds =
    progress?.state.journeyInteractionIds ??
    (effectiveStartInteractionId ? [effectiveStartInteractionId] : []);
  const positioned = ensureStoryInteractionPositions(
    await loadStoryRuntimeSlice(
      runtimeStory,
      journeyInteractionIds.at(-1) ?? null,
      journeyInteractionIds,
    ),
  );

  return { positioned, progress, effectiveStartInteractionId, loadedProgressMode };
}
