import { describe, expect, it } from 'vitest';
import type { Story } from '../model/index.js';
import { buildReaderProgressState, getJourneyOwnedItemDefinitionIds } from '../reader/index.js';
import { getAvailableInteractions, getTriggerConditions } from '../triggers/index.js';
import { createDemoStories } from './story.js';

const timestamp = '2026-07-14T08:00:00.000Z';
const stories = createDemoStories(timestamp, (kind) => `demo-${kind}`);
const storyByTitle = (title: string) => stories.find((story) => story.title === title)!;
const id = (story: Story, localId: string) => `${story.id}:${localId}`;

describe('demo stories', () => {
  it('builds the five ordered scenarios with globally unique persisted ids', () => {
    expect(stories.map(({ title }) => title)).toEqual([
      'Demo 1: paths only',
      'Demo 2: visited interaction conditions',
      'Demo 3: world variables',
      'Demo 4: character stats and simple items',
      'Demo 5: body, equipment, and item stats',
    ]);
    expect(
      stories.every((story) => story.createdAt === timestamp && story.updatedAt === timestamp),
    ).toBe(true);

    const persistedIds = stories.flatMap((story) => [
      story.id,
      ...(story.locations ?? []).flatMap((location) => [
        location.id,
        ...(location.stats ?? []).map(({ id }) => id),
        ...(location.items ?? []).map(({ id }) => id),
      ]),
      ...(story.characters ?? []).flatMap((character) => [
        character.id,
        ...(character.stats ?? []).map(({ id }) => id),
        ...(character.items ?? []).map(({ id }) => id),
      ]),
      ...(story.stats ?? []).map(({ id }) => id),
      ...(story.statDefinitions ?? []).map(({ id }) => id),
      ...(story.itemDefinitions ?? []).flatMap((definition) => [
        definition.id,
        ...(definition.stats ?? []).map(({ id }) => id),
      ]),
      ...story.interactions.flatMap((interaction) => [
        interaction.id,
        ...interaction.triggers.map(({ id }) => id),
      ]),
    ]);
    expect(new Set(persistedIds).size).toBe(persistedIds.length);
    expect(
      stories.every((story) =>
        story.interactions.every((interaction) => interaction.triggers.length > 0),
      ),
    ).toBe(true);
  });

  it('keeps the first scenario limited to unconditional paths', () => {
    const story = storyByTitle('Demo 1: paths only');

    expect(story.statDefinitions).toEqual([]);
    expect(story.characters).toEqual([]);
    expect(story.itemDefinitions).toEqual([]);
    expect(
      story.interactions.every((interaction) =>
        interaction.triggers.every((trigger) => getTriggerConditions(trigger).length === 0),
      ),
    ).toBe(true);
    expect(
      story.interactions.some((interaction) =>
        interaction.triggers.some((trigger) => trigger.inputInteractionIds.length === 4),
      ),
    ).toBe(true);
  });

  it('unlocks the second scenario conclusion only after both clue interactions were visited', () => {
    const story = storyByTitle('Demo 2: visited interaction conditions');
    const hall = id(story, 'hall');

    expect(availableIds(story, [id(story, 'briefing'), hall])).toEqual(
      expect.arrayContaining([id(story, 'archive'), id(story, 'garden'), id(story, 'leave-early')]),
    );
    expect(
      availableIds(story, [id(story, 'briefing'), hall, id(story, 'archive'), hall]),
    ).not.toContain(id(story, 'archive'));
    expect(
      availableIds(story, [
        id(story, 'briefing'),
        hall,
        id(story, 'archive'),
        hall,
        id(story, 'garden'),
        hall,
      ]),
    ).toEqual([id(story, 'confrontation')]);
  });

  it('uses Story-owned typed stats as world variables in the third scenario', () => {
    const story = storyByTitle('Demo 3: world variables');
    expect(story.stats).toHaveLength(3);

    expect(
      availableIds(story, [
        id(story, 'control-room'),
        id(story, 'restore-power'),
        id(story, 'assessment'),
      ]),
    ).toEqual(expect.arrayContaining([id(story, 'safe-release'), id(story, 'shelter')]));
    expect(
      availableIds(story, [
        id(story, 'control-room'),
        id(story, 'force-gate'),
        id(story, 'assessment'),
      ]),
    ).toEqual(expect.arrayContaining([id(story, 'evacuate'), id(story, 'shelter')]));
  });

  it('keeps the fourth scenario inventory flat while combining character stats and item ownership', () => {
    const story = storyByTitle('Demo 4: character stats and simple items');
    const character = story.characters?.[0];

    expect(character?.stats).toHaveLength(2);
    expect(character?.items).toHaveLength(2);
    expect(character?.items?.every((item) => item.parentItemId === undefined)).toBe(true);
    expect(
      story.itemDefinitions?.every((definition) => (definition.stats?.length ?? 0) === 0),
    ).toBe(true);
    expect(
      availableIds(story, [id(story, 'prepare'), id(story, 'take-lantern'), id(story, 'entrance')]),
    ).toEqual([id(story, 'dark-gallery')]);
    expect(
      availableIds(story, [id(story, 'prepare'), id(story, 'take-map'), id(story, 'entrance')]),
    ).toEqual(expect.arrayContaining([id(story, 'mapped-route'), id(story, 'retreat')]));
  });

  it('represents body parts and equipment as one item tree with per-instance stat conditions', () => {
    const story = storyByTitle('Demo 5: body, equipment, and item stats');
    const items = story.characters?.[0].items ?? [];

    expect(items.filter((item) => item.relationshipType === 'part_of')).toHaveLength(2);
    expect(items.filter((item) => item.relationshipType === 'equipped')).toHaveLength(2);
    expect(items.filter((item) => item.relationshipType === 'installed')).toHaveLength(1);
    expect(story.itemDefinitions?.some((definition) => (definition.stats?.length ?? 0) > 1)).toBe(
      true,
    );
    expect(
      availableIds(story, [
        id(story, 'diagnostics'),
        id(story, 'calibrate'),
        id(story, 'assessment'),
      ]),
    ).toEqual([id(story, 'field-ready')]);
    expect(
      availableIds(story, [
        id(story, 'diagnostics'),
        id(story, 'stress-test'),
        id(story, 'assessment'),
      ]),
    ).toEqual([id(story, 'repair-required')]);
  });
});

function availableIds(story: Story, journey: string[]): string[] {
  const state = buildReaderProgressState(story, journey);
  const currentInteraction = story.interactions.find(({ id }) => id === state.currentInteractionId);
  return getAvailableInteractions(
    story,
    state.currentInteractionId,
    state.visitedInteractionIds,
    state.currentLocationId,
    currentInteraction?.characterIds ?? [],
    state.statValues,
    state.currentDateTime,
    getJourneyOwnedItemDefinitionIds(story, journey),
    state.itemStatValues,
  ).map(({ id }) => id);
}
