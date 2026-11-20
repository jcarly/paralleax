import {
  getNextChildPosition,
  getNextRootPosition,
  MAX_STORY_PAGE_SIZE,
  type Interaction,
  type Position,
  type Story,
} from '@paralleax/shared';
import type { ParalleaxApiClient } from '../api-client.js';
import { interactionPageSchema, storySchema } from '../api-contract.js';
import { ToolError } from '../tool-result.js';
import { storyPath } from './story-read-tools.js';

type PlacedInteraction = Pick<Interaction, 'id' | 'title' | 'position'> & {
  triggers?: Array<{ id: string; inputInteractionIds: string[] }>;
};

/** The fields the shared placement rule reads, in its own Story shape. */
function placementStory(storyId: string, interactions: readonly PlacedInteraction[]): Story {
  return {
    id: storyId,
    title: '',
    createdAt: '',
    updatedAt: '',
    interactions: interactions.map(({ id, title, position, triggers = [] }) => ({
      id,
      title,
      body: '',
      position,
      triggers: triggers.map((trigger) => ({
        id: trigger.id,
        inputInteractionIds: trigger.inputInteractionIds,
      })),
    })),
  };
}

async function allInteractionSummaries(api: ParalleaxApiClient, storyId: string) {
  const summaries: PlacedInteraction[] = [];
  for (let page = 1; ; page += 1) {
    const result = await api.get(
      storyPath(storyId, '/editor/interactions'),
      interactionPageSchema,
      {
        page,
        pageSize: MAX_STORY_PAGE_SIZE,
      },
    );
    summaries.push(...result.interactions);
    if (!result.hasMore) {
      return summaries;
    }
  }
}

/**
 * Applies the editor's placement rule from @paralleax/shared, so an
 * interaction created by an assistant lands where the editor would put it.
 */
export async function nextInteractionPosition(
  api: ParalleaxApiClient,
  storyId: string,
  parentInteractionId: string | undefined,
): Promise<Position> {
  if (parentInteractionId === undefined) {
    // Root placement depends on which interactions are roots (Trigger inputs).
    const story = await api.get(storyPath(storyId), storySchema);
    return getNextRootPosition(placementStory(storyId, story.interactions));
  }
  const story = placementStory(storyId, await allInteractionSummaries(api, storyId));
  const parent = story.interactions.find(({ id }) => id === parentInteractionId);
  if (!parent) {
    throw new ToolError(
      'PARENT_INTERACTION_NOT_FOUND',
      'Parent interaction not found in this story',
    );
  }
  return getNextChildPosition(story, parent);
}
