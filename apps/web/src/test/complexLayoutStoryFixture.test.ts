import { describe, expect, it } from 'vitest';
import {
  complexLayoutStoryMotifs as motifs,
  createComplexLayoutStoryFixture,
} from './complexLayoutStoryFixture';

type FixtureStory = ReturnType<typeof createComplexLayoutStoryFixture>;
type FixtureInteraction = FixtureStory['interactions'][number];
type FixtureTrigger = FixtureInteraction['triggers'][number];
type FixtureConditionGroup = NonNullable<FixtureTrigger['conditionGroups']>[number];
type InteractionLookup = (id: string) => FixtureInteraction;
type LinkChecker = (source: string, target: string) => boolean;

interface FixtureReferenceSets {
  interactionIds: Set<string>;
  locationIds: Set<string>;
  characterIds: Set<string>;
  triggerIds: Set<string>;
  groupIds: Set<string>;
}

describe('complex layout story fixture', () => {
  it(
    'provides 100 deterministic, independent interactions with valid story references',
    assertFixtureIsIndependentAndValid,
  );
  it(
    'retains fan-out, multi-input convergence, independent variants, skips, and loops',
    assertFixtureMotifs,
  );
  it(
    'keeps a disconnected island and starts with overlapping, differently sized content',
    assertFixtureIslandAndContent,
  );
});

function assertFixtureIsIndependentAndValid() {
  const story = createComplexLayoutStoryFixture();
  const copy = createComplexLayoutStoryFixture();
  expect(story).toEqual(copy);
  expect(story.interactions).toHaveLength(100);
  expect(new Set(story.interactions.map(({ id }) => id)).size).toBe(100);
  assertFixtureReferences(story);

  const first = requireDefined(story.interactions[0], 'first interaction');
  const second = requireDefined(story.interactions[1], 'second interaction');
  first.position.x += 1;
  const trigger = requireDefined(second.triggers[0], 'second interaction trigger');
  requireDefined(trigger.inputInteractionIds, 'trigger inputs').length = 0;
  expect(copy).toEqual(createComplexLayoutStoryFixture());
}

function assertFixtureMotifs() {
  const interactions = new Map(
    createComplexLayoutStoryFixture().interactions.map((interaction) => [
      interaction.id,
      interaction,
    ]),
  );
  const interactionById: InteractionLookup = (id) =>
    requireDefined(interactions.get(id), `interaction ${id}`);
  const hasLink: LinkChecker = (source, target) =>
    interactionById(target).triggers.some(({ inputInteractionIds }) =>
      inputInteractionIds.includes(source),
    );

  assertStageMotifs(interactionById, hasLink);
  assertLongRangeLinks(interactionById);
  assertCycleMotifs(hasLink);
  assertVariantMotifs(interactionById, hasLink);
}

function assertStageMotifs(interactionById: InteractionLookup, hasLink: LinkChecker) {
  for (const stage of motifs.stages) {
    for (const childId of stage.childIds) {
      expect(hasLink(stage.entryId, childId)).toBe(true);
    }
    const convergence = requireDefined(
      interactionById(stage.multiInput.targetId).triggers.find(
        ({ id }) => id === stage.multiInput.triggerId,
      ),
      `convergence trigger ${stage.multiInput.triggerId}`,
    );
    expect(convergence.inputInteractionIds).toEqual(stage.multiInput.sourceIds);
    expect(
      interactionById(stage.alternativeTriggers.targetId).triggers.map(({ id }) => id),
    ).toEqual(expect.arrayContaining(stage.alternativeTriggers.triggerIds));
  }
}

function assertLongRangeLinks(interactionById: InteractionLookup) {
  expect(motifs.longRangeLinks.map(({ indexDistance }) => indexDistance)).toEqual([2, 5, 17, 40]);
  for (const link of motifs.longRangeLinks) {
    const trigger = requireDefined(
      interactionById(link.targetId).triggers.find(({ id }) => id === link.triggerId),
      `long-range trigger ${link.triggerId}`,
    );
    expect(trigger.inputInteractionIds).toEqual([link.sourceId]);
  }
}

function assertCycleMotifs(hasLink: LinkChecker) {
  for (const path of motifs.cycles) {
    expect(requireDefined(path[0], 'cycle start')).toBe(
      requireDefined(path[path.length - 1], 'cycle end'),
    );
    for (let index = 1; index < path.length; index += 1) {
      const source = requireDefined(path[index - 1], 'cycle source');
      const target = requireDefined(path[index], 'cycle target');
      expect(hasLink(source, target)).toBe(true);
    }
  }

  expect(motifs.twoInteractionCycles).toHaveLength(3);
  for (const [first, second, returned] of motifs.twoInteractionCycles) {
    const firstId = requireDefined(first, 'cycle first interaction');
    const secondId = requireDefined(second, 'cycle second interaction');
    expect(firstId).not.toBe(secondId);
    expect(requireDefined(returned, 'cycle return interaction')).toBe(firstId);
    expect(hasLink(firstId, secondId)).toBe(true);
    expect(hasLink(secondId, firstId)).toBe(true);
  }
}

function assertVariantMotifs(interactionById: InteractionLookup, hasLink: LinkChecker) {
  expect(hasLink(motifs.selfLoop.interactionId, motifs.selfLoop.interactionId)).toBe(true);
  const variants = interactionById(motifs.sameInputVariants.targetId).triggers.filter(({ id }) =>
    motifs.sameInputVariants.triggerIds.includes(id),
  );
  expect(variants).toHaveLength(2);
  for (const trigger of variants) {
    expect(trigger.inputInteractionIds).toEqual([motifs.sameInputVariants.sourceId]);
  }
  expect(requireDefined(variants[0], 'first input variant').appearanceProbability).not.toBe(
    requireDefined(variants[1], 'second input variant').appearanceProbability,
  );
}

function assertFixtureIslandAndContent() {
  const story = createComplexLayoutStoryFixture();
  const islandIds = new Set(motifs.disconnectedInteractionIds);
  for (const interaction of story.interactions) {
    for (const trigger of interaction.triggers) {
      for (const sourceId of trigger.inputInteractionIds) {
        expect(islandIds.has(sourceId)).toBe(islandIds.has(interaction.id));
      }
    }
  }
  const positions = story.interactions.map(({ position }) => JSON.stringify(position));
  expect(new Set(positions).size).toBeLessThan(story.interactions.length);
  expect(new Set(story.interactions.map(({ body }) => body.length)).size).toBeGreaterThan(2);
  expect(new Set(story.interactions.map(({ title }) => title.length)).size).toBeGreaterThan(2);
  expect(
    story.interactions.some(
      ({ characterIds }) => requireDefined(characterIds, 'interaction characters').length === 0,
    ),
  ).toBe(true);
  expect(
    story.interactions.some(
      ({ characterIds }) => requireDefined(characterIds, 'interaction characters').length > 3,
    ),
  ).toBe(true);
}

function assertFixtureReferences(story: FixtureStory) {
  const references: FixtureReferenceSets = {
    interactionIds: new Set(story.interactions.map(({ id }) => id)),
    locationIds: new Set(requireDefined(story.locations, 'story locations').map(({ id }) => id)),
    characterIds: new Set(requireDefined(story.characters, 'story characters').map(({ id }) => id)),
    triggerIds: new Set(),
    groupIds: new Set(),
  };
  for (const interaction of story.interactions) {
    assertInteractionReferences(interaction, references);
  }
}

function assertInteractionReferences(
  interaction: FixtureInteraction,
  references: FixtureReferenceSets,
) {
  expect(interaction.triggers.length).toBeGreaterThan(0);
  if (interaction.locationId) {
    expect(references.locationIds.has(interaction.locationId)).toBe(true);
  }
  const characterIds = requireDefined(interaction.characterIds, 'interaction characters');
  expect(new Set(characterIds).size).toBe(characterIds.length);
  for (const id of characterIds) {
    expect(references.characterIds.has(id)).toBe(true);
  }
  for (const trigger of interaction.triggers) {
    assertTriggerReferences(trigger, references);
  }
}

function assertTriggerReferences(trigger: FixtureTrigger, references: FixtureReferenceSets) {
  expect(references.triggerIds.has(trigger.id)).toBe(false);
  references.triggerIds.add(trigger.id);
  expect(new Set(trigger.inputInteractionIds).size).toBe(trigger.inputInteractionIds.length);
  for (const id of trigger.inputInteractionIds) {
    expect(references.interactionIds.has(id)).toBe(true);
  }
  const groups = requireDefined(trigger.conditionGroups, 'trigger condition groups');
  expect(groups.length).toBeGreaterThan(0);
  expect(trigger.conditions).toBeUndefined();
  for (const group of groups) {
    assertConditionGroupReferences(group, references);
  }
}

function assertConditionGroupReferences(
  group: FixtureConditionGroup,
  references: FixtureReferenceSets,
) {
  expect(references.groupIds.has(group.id)).toBe(false);
  references.groupIds.add(group.id);
  for (const condition of group.conditions) {
    if ('interactionId' in condition) {
      expect(references.interactionIds.has(condition.interactionId)).toBe(true);
    }
  }
}

function requireDefined<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Expected ${label} to be defined.`);
  }
  return value;
}
