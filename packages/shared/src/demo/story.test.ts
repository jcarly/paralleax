import { describe, expect, it } from 'vitest';
import { createDemoStory } from './story.js';

describe('demo story', () => {
  it('covers roots, branches, multi-input triggers, and conditions', () => {
    const story = createDemoStory('demo-story', '2026-07-14T08:00:00.000Z');

    expect(story).toMatchObject({
      id: 'demo-story',
      title: 'Demo: branching investigation',
      createdAt: '2026-07-14T08:00:00.000Z',
      updatedAt: '2026-07-14T08:00:00.000Z',
    });
    expect(story.interactions).toHaveLength(9);
    expect(story.interactions.every((interaction) => interaction.triggers.length >= 1)).toBe(true);
    expect(
      story.interactions.filter((interaction) =>
        interaction.triggers.some((trigger) => trigger.inputInteractionIds.length === 0),
      ),
    ).toHaveLength(2);
    expect(
      story.interactions.some((interaction) =>
        interaction.triggers.some((trigger) => trigger.inputInteractionIds.length > 1),
      ),
    ).toBe(true);
    expect(
      story.interactions.some((interaction) =>
        interaction.triggers.some((trigger) => trigger.conditions.length > 0),
      ),
    ).toBe(true);
  });
});
