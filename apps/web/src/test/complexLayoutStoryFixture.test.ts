import { describe, expect, it } from 'vitest';
import {
  complexLayoutStoryMotifs as motifs,
  createComplexLayoutStoryFixture,
} from './complexLayoutStoryFixture';

describe('complex layout story fixture', () => {
  it('provides 100 deterministic, independent interactions with valid story references', () => {
    const story = createComplexLayoutStoryFixture();
    const copy = createComplexLayoutStoryFixture();
    expect(story).toEqual(copy);
    expect(story.interactions).toHaveLength(100);
    const interactionIds = new Set(story.interactions.map(({ id }) => id));
    const locationIds = new Set(story.locations!.map(({ id }) => id));
    const characterIds = new Set(story.characters!.map(({ id }) => id));
    const triggerIds = new Set<string>();
    const groupIds = new Set<string>();
    expect(interactionIds.size).toBe(100);
    for (const interaction of story.interactions) {
      expect(interaction.triggers.length).toBeGreaterThan(0);
      if (interaction.locationId) expect(locationIds.has(interaction.locationId)).toBe(true);
      for (const id of interaction.characterIds!) expect(characterIds.has(id)).toBe(true);
      expect(new Set(interaction.characterIds).size).toBe(interaction.characterIds!.length);
      for (const trigger of interaction.triggers) {
        expect(triggerIds.has(trigger.id)).toBe(false);
        triggerIds.add(trigger.id);
        expect(new Set(trigger.inputInteractionIds).size).toBe(trigger.inputInteractionIds.length);
        for (const id of trigger.inputInteractionIds) expect(interactionIds.has(id)).toBe(true);
        expect(trigger.conditionGroups!.length).toBeGreaterThan(0);
        expect(trigger.conditions).toBeUndefined();
        for (const group of trigger.conditionGroups!) {
          expect(groupIds.has(group.id)).toBe(false);
          groupIds.add(group.id);
          for (const condition of group.conditions) {
            if ('interactionId' in condition) {
              expect(interactionIds.has(condition.interactionId)).toBe(true);
            }
          }
        }
      }
    }
    story.interactions[0]!.position.x += 1;
    story.interactions[1]!.triggers[0]!.inputInteractionIds.length = 0;
    expect(copy).toEqual(createComplexLayoutStoryFixture());
  });

  it('retains fan-out, multi-input convergence, independent variants, skips, and loops', () => {
    const story = createComplexLayoutStoryFixture();
    const interactions = new Map(
      story.interactions.map((interaction) => [interaction.id, interaction]),
    );
    const hasLink = (source: string, target: string) =>
      interactions
        .get(target)!
        .triggers.some(({ inputInteractionIds }) => inputInteractionIds.includes(source));
    for (const stage of motifs.stages) {
      for (const childId of stage.childIds) expect(hasLink(stage.entryId, childId)).toBe(true);
      const convergence = interactions
        .get(stage.multiInput.targetId)!
        .triggers.find(({ id }) => id === stage.multiInput.triggerId)!;
      expect(convergence.inputInteractionIds).toEqual(stage.multiInput.sourceIds);
      expect(
        interactions.get(stage.alternativeTriggers.targetId)!.triggers.map(({ id }) => id),
      ).toEqual(expect.arrayContaining(stage.alternativeTriggers.triggerIds));
    }
    expect(motifs.longRangeLinks.map(({ indexDistance }) => indexDistance)).toEqual([2, 5, 17, 40]);
    for (const link of motifs.longRangeLinks) {
      expect(
        interactions.get(link.targetId)!.triggers.find(({ id }) => id === link.triggerId)
          ?.inputInteractionIds,
      ).toEqual([link.sourceId]);
    }
    for (const path of motifs.cycles) {
      expect(path[0]).toBe(path[path.length - 1]);
      for (let index = 1; index < path.length; index += 1) {
        expect(hasLink(path[index - 1]!, path[index]!)).toBe(true);
      }
    }
    expect(hasLink(motifs.selfLoop.interactionId, motifs.selfLoop.interactionId)).toBe(true);
    const variants = interactions
      .get(motifs.sameInputVariants.targetId)!
      .triggers.filter(({ id }) => motifs.sameInputVariants.triggerIds.includes(id));
    expect(variants).toHaveLength(2);
    for (const trigger of variants) {
      expect(trigger.inputInteractionIds).toEqual([motifs.sameInputVariants.sourceId]);
    }
    expect(variants[0]!.appearanceProbability).not.toBe(variants[1]!.appearanceProbability);
  });

  it('keeps a disconnected island and starts with overlapping, differently sized content', () => {
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
    expect(story.interactions.some(({ characterIds }) => characterIds!.length === 0)).toBe(true);
    expect(story.interactions.some(({ characterIds }) => characterIds!.length > 3)).toBe(true);
  });
});
