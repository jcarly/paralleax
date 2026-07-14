import { describe, expect, it } from 'vitest';
import {
  deleteInteractionFromStory,
  deleteTriggerInStory,
  getNextChildPosition,
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
        triggers: [{
          id: 'trigger-end',
          inputInteractionIds: ['root', 'middle'],
          conditions: [{ interactionId: 'root', hasBeenVisited: true }],
        }],
      },
    ],
  };
}

describe('shared story operations', () => {
  it('deduplicates trigger inputs when updating a trigger', () => {
    const updated = updateTriggerInStory(storyFixture(), 'end', 'trigger-end', {
      inputInteractionIds: ['root', 'root', 'middle'],
      conditions: [],
    });

    expect(updated.interactions[2].triggers[0].inputInteractionIds).toEqual(['root', 'middle']);
  });

  it('removes only the requested trigger from its output interaction', () => {
    const story = storyFixture();
    story.interactions[2].triggers.push({ id: 'trigger-alt', inputInteractionIds: ['middle'], conditions: [] });

    const updated = deleteTriggerInStory(story, 'end', 'trigger-end');

    expect(updated.interactions[2].triggers).toEqual([
      { id: 'trigger-alt', inputInteractionIds: ['middle'], conditions: [] },
    ]);
  });

  it('deletes triggers that only depended on a deleted input interaction', () => {
    const updated = deleteInteractionFromStory(storyFixture(), 'root');

    expect(updated.interactions.map((item) => item.id)).toEqual(['middle', 'end']);
    expect(updated.interactions[0].triggers).toEqual([]);
    expect(updated.interactions[1].triggers[0].inputInteractionIds).toEqual(['middle']);
    expect(updated.interactions[1].triggers[0].conditions).toEqual([]);
  });

  it('does not restore locally deleted triggers from stale server stories', () => {
    const current = deleteTriggerInStory(storyFixture(), 'middle', 'trigger-middle');
    const staleIncoming = storyFixture();

    const merged = mergeServerStory(current, staleIncoming, undefined, {
      deletedTriggerIds: new Set(['trigger-middle']),
    });

    expect(merged.interactions[1].triggers).toEqual([]);
  });

  it('preserves local triggers when merging interaction-only saves', () => {
    const current = deleteTriggerInStory(storyFixture(), 'middle', 'trigger-middle');
    const staleIncoming = storyFixture();
    staleIncoming.interactions[1].position = { x: 445, y: 275 };

    const merged = mergeServerStory(current, staleIncoming, {
      interactionId: 'middle',
      patch: { position: { x: 445, y: 275 } },
    }, { preserveCurrentTriggers: true });

    expect(merged.interactions[1].position).toEqual({ x: 445, y: 275 });
    expect(merged.interactions[1].triggers).toEqual([]);
  });

  it('finds the next child position below occupied outputs', () => {
    const story = storyFixture();
    story.interactions[1].position = { x: 420, y: 260 };

    expect(getNextChildPosition(story, story.interactions[0])).toEqual({ x: 420, y: 410 });
  });

  it('normalizes trigger inputs without changing their first-seen order', () => {
    expect(normalizeTriggerInputIds(['b', 'a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });
});
