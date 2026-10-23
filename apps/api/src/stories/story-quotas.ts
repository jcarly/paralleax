import { UnprocessableEntityException } from '@nestjs/common';
import type { Story } from '@paralleax/shared';
import { apiErrorResponse } from '../operations/api-error-response';

export const DEFAULT_STORY_QUOTAS = {
  interactions: 2_000,
  triggers: 8_000,
  characters: 1_000,
  locations: 1_000,
  statDefinitions: 2_000,
  statAssignments: 8_000,
  itemDefinitions: 2_000,
  itemInstances: 10_000,
  groups: 1_000,
  graphDecorations: 2_000,
  serializedBytes: 32 * 1024 * 1024,
} as const;

export type StoryQuotaResource = keyof typeof DEFAULT_STORY_QUOTAS;
export type StoryQuotas = Record<StoryQuotaResource, number>;

/** Override individual limits with PARALLEAX_STORY_QUOTA_<UPPER_SNAKE_CASE_RESOURCE>. */
export function storyQuotasFromEnvironment(env: NodeJS.ProcessEnv = process.env): StoryQuotas {
  const quotas: StoryQuotas = { ...DEFAULT_STORY_QUOTAS };
  for (const resource of Object.keys(quotas) as StoryQuotaResource[]) {
    const key = `PARALLEAX_STORY_QUOTA_${resource.replace(/[A-Z]/g, (letter) => `_${letter}`).toUpperCase()}`;
    const raw = env[key];
    if (raw === undefined) continue;
    const value = Number(raw);
    if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(value)) {
      throw new Error(`${key} must be a positive safe integer`);
    }
    quotas[resource] = value;
  }
  return quotas;
}

export function measureStoryQuotaUsage(story: Story): StoryQuotas {
  const characters = story.characters ?? [];
  const locations = story.locations ?? [];
  const definitions = story.itemDefinitions ?? [];
  // Access projections are response metadata, not authored Story content.
  const authoredStory = { ...story };
  delete authoredStory.capabilities;
  delete authoredStory.owner;
  return {
    interactions: story.interactions.length,
    triggers: story.interactions.reduce(
      (count, interaction) => count + interaction.triggers.length,
      0,
    ),
    characters: characters.length,
    locations: locations.length,
    statDefinitions: story.statDefinitions?.length ?? 0,
    statAssignments:
      (story.stats?.length ?? 0) +
      characters.reduce((count, character) => count + (character.stats?.length ?? 0), 0) +
      locations.reduce((count, location) => count + (location.stats?.length ?? 0), 0) +
      definitions.reduce((count, definition) => count + (definition.stats?.length ?? 0), 0),
    itemDefinitions: definitions.length,
    itemInstances:
      characters.reduce((count, character) => count + (character.items?.length ?? 0), 0) +
      locations.reduce((count, location) => count + (location.items?.length ?? 0), 0),
    groups: story.groups?.length ?? 0,
    graphDecorations: story.graphDecorations?.length ?? 0,
    serializedBytes: Buffer.byteLength(JSON.stringify(authoredStory), 'utf8'),
  };
}

export function assertStoryWithinQuotas(
  attemptedStory: Story,
  currentStory?: Story,
  quotas: StoryQuotas = storyQuotasFromEnvironment(),
): void {
  const attempted = measureStoryQuotaUsage(attemptedStory);
  const current = currentStory ? measureStoryQuotaUsage(currentStory) : undefined;
  for (const resource of Object.keys(quotas) as StoryQuotaResource[]) {
    const limit = quotas[resource];
    if (
      attempted[resource] <= limit ||
      (current && current[resource] > limit && attempted[resource] <= current[resource])
    )
      continue;
    throw new UnprocessableEntityException(
      apiErrorResponse(
        'STORY_QUOTA_EXCEEDED',
        'The Story exceeds its allowed size or entity count.',
        {
          resource,
          limit,
          current: current?.[resource] ?? 0,
          attempted: attempted[resource],
        },
      ),
    );
  }
}
