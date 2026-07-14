import { describe, expect, it } from 'vitest';
import {
  deleteInteractionFromStory,
  deleteTriggerInStory,
  createDemoStory,
  getNextChildPosition,
  getNextParentPosition,
  getNextRootPosition,
  mergeServerStory,
  normalizeTriggerInputIds,
  updateTriggerInStory,
  type Story,
} from './index';

function storyFixture(): Story {
  return {
    id: 'story-1',
    title: 'Story',
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    interactions: [
      {
        id: 'root',
        title: 'Root',
        body: 'Start',
        position: { x: 80, y: 120 },
        triggers: [{ id: 'trigger-root', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'middle',
        title: 'Middle',
        body: 'Middle body',
        position: { x: 420, y: 260 },
        triggers: [{ id: 'trigger-middle', inputInteractionIds: ['root'], conditions: [] }],
      },
      {
        id: 'end',
        title: 'End',
        body: 'End body',
        position: { x: 760, y: 410 },
        triggers: [
          {
            id: 'trigger-end',
            inputInteractionIds: ['root', 'middle'],
            conditions: [{ interactionId: 'root', hasBeenVisited: true }],
          },
        ],
      },
    ],
  };
}

describe('shared story operations', () => {
  it('creates a demo story covering roots, branches, multi-input triggers, and conditions', () => {
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

  it('deduplicates trigger inputs when updating a trigger', () => {
    const updated = updateTriggerInStory(storyFixture(), 'end', 'trigger-end', {
      inputInteractionIds: ['root', 'root', 'middle'],
      conditions: [],
    });

    expect(updated.interactions[2].triggers[0].inputInteractionIds).toEqual(['root', 'middle']);
  });

  it('removes only the requested trigger from its output interaction', () => {
    const story = storyFixture();
    story.interactions[2].triggers.push({
      id: 'trigger-alt',
      inputInteractionIds: ['middle'],
      conditions: [],
    });

    const updated = deleteTriggerInStory(story, 'end', 'trigger-end');

    expect(updated.interactions[2].triggers).toEqual([
      { id: 'trigger-alt', inputInteractionIds: ['middle'], conditions: [] },
    ]);
  });

  it('keeps the last trigger of an interaction', () => {
    const updated = deleteTriggerInStory(storyFixture(), 'middle', 'trigger-middle');

    expect(updated.interactions[1].triggers).toEqual([
      { id: 'trigger-middle', inputInteractionIds: ['root'], conditions: [] },
    ]);
  });

  it('keeps triggers as root triggers when deleting their only input interaction', () => {
    const updated = deleteInteractionFromStory(storyFixture(), 'root');

    expect(updated.interactions.map((item) => item.id)).toEqual(['middle', 'end']);
    expect(updated.interactions[0].triggers).toEqual([
      { id: 'trigger-middle', inputInteractionIds: [], conditions: [] },
    ]);
    expect(updated.interactions[1].triggers[0].inputInteractionIds).toEqual(['middle']);
    expect(updated.interactions[1].triggers[0].conditions).toEqual([]);
  });

  it('does not restore locally deleted triggers from stale server stories', () => {
    const story = storyFixture();
    story.interactions[1].triggers.push({
      id: 'trigger-middle-alt',
      inputInteractionIds: [],
      conditions: [],
    });
    const current = deleteTriggerInStory(story, 'middle', 'trigger-middle');
    const staleIncoming = structuredClone(story);

    const merged = mergeServerStory(current, staleIncoming, undefined, {
      deletedTriggerIds: new Set(['trigger-middle']),
    });

    expect(merged.interactions[1].triggers).toEqual([
      { id: 'trigger-middle-alt', inputInteractionIds: [], conditions: [] },
    ]);
  });

  it('does not restore locally deleted trigger inputs from stale server stories', () => {
    const current = updateTriggerInStory(storyFixture(), 'middle', 'trigger-middle', {
      inputInteractionIds: [],
      conditions: [],
    });
    const staleIncoming = storyFixture();

    const merged = mergeServerStory(current, staleIncoming, undefined, {
      deletedTriggerInputKeys: new Set(['trigger-middle:root']),
    });

    expect(merged.interactions[1].triggers).toEqual([
      { id: 'trigger-middle', inputInteractionIds: [], conditions: [] },
    ]);
  });

  it('preserves local triggers when merging interaction-only saves', () => {
    const story = storyFixture();
    story.interactions[1].triggers.push({
      id: 'trigger-middle-alt',
      inputInteractionIds: [],
      conditions: [],
    });
    const current = deleteTriggerInStory(story, 'middle', 'trigger-middle');
    const staleIncoming = structuredClone(story);
    staleIncoming.interactions[1].position = { x: 445, y: 275 };

    const merged = mergeServerStory(
      current,
      staleIncoming,
      {
        interactionId: 'middle',
        patch: { position: { x: 445, y: 275 } },
      },
      { preserveCurrentTriggers: true },
    );

    expect(merged.interactions[1].position).toEqual({ x: 445, y: 275 });
    expect(merged.interactions[1].triggers).toEqual([
      { id: 'trigger-middle-alt', inputInteractionIds: [], conditions: [] },
    ]);
  });

  it('finds the next child position below occupied outputs', () => {
    const story = storyFixture();
    story.interactions[1].position = { x: 420, y: 260 };

    expect(getNextChildPosition(story, story.interactions[0])).toEqual({ x: 420, y: 410 });
  });

  it('finds the next parent position beside the target without overlap', () => {
    const story = storyFixture();
    story.interactions.push({
      id: 'other-parent',
      title: 'Other parent',
      body: 'Already there',
      position: { x: 420, y: 260 },
      triggers: [{ id: 'trigger-other-parent', inputInteractionIds: [], conditions: [] }],
    });

    expect(getNextParentPosition(story, story.interactions[2])).toEqual({ x: 420, y: 410 });
  });

  it('finds the next root position below the lowest existing root', () => {
    const story = storyFixture();
    story.interactions.push({
      id: 'second-root',
      title: 'Second root',
      body: 'Another start',
      position: { x: 80, y: 520 },
      triggers: [{ id: 'trigger-second-root', inputInteractionIds: [], conditions: [] }],
    });

    expect(getNextRootPosition(story)).toEqual({ x: 80, y: 670 });
  });

  it('normalizes trigger inputs without changing their first-seen order', () => {
    expect(normalizeTriggerInputIds(['b', 'a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });
});
