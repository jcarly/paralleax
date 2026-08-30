import { describe, expect, it } from 'vitest';
import type { Story } from '../model/stories.js';
import {
  applyStoryChangeDelta,
  createStoryChangeDelta,
  invertStoryChangeDelta,
  isStoryGraphPositionDelta,
} from './story-history.js';

const story: Story = {
  id: 'story-1',
  revision: 1,
  title: 'Original',
  interactions: [
    {
      id: 'interaction-1',
      title: 'Start',
      body: 'Body',
      position: { x: 10, y: 20 },
      triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
    },
  ],
  createdAt: '2026-08-28T08:00:00.000Z',
  updatedAt: '2026-08-28T08:00:00.000Z',
};

describe('Story authored change history', () => {
  it('reverses one field without overwriting an unrelated later edit', () => {
    const moved = structuredClone(story);
    moved.interactions[0].position = { x: 200, y: 300 };
    const delta = createStoryChangeDelta(story, moved)!;
    const later = structuredClone(moved);
    later.interactions[0].title = 'Later title';

    const result = applyStoryChangeDelta(later, delta, 'backward');

    expect(result.applied).toBe(true);
    if (!result.applied) return;
    expect(result.story.interactions[0].position).toEqual({ x: 10, y: 20 });
    expect(result.story.interactions[0].title).toBe('Later title');
  });

  it('inverts a recorded change without diffing the complete Story again', () => {
    const moved = structuredClone(story);
    moved.interactions[0].position = { x: 200, y: 300 };
    moved.interactions[0].triggers[0].position = { x: 200, y: 220 };
    const delta = createStoryChangeDelta(story, moved)!;
    const inverse = invertStoryChangeDelta(delta);

    expect(isStoryGraphPositionDelta(delta)).toBe(true);
    expect(isStoryGraphPositionDelta(inverse)).toBe(true);
    const restored = applyStoryChangeDelta(moved, inverse, 'forward');
    expect(restored.applied).toBe(true);
    if (!restored.applied) return;
    expect(restored.story.interactions[0].position).toEqual(story.interactions[0].position);
    expect(restored.story.interactions[0].triggers[0].position).toBeUndefined();
  });

  it('does not classify content changes as graph position changes', () => {
    const renamed = structuredClone(story);
    renamed.interactions[0].title = 'Renamed';

    expect(isStoryGraphPositionDelta(createStoryChangeDelta(story, renamed)!)).toBe(false);
  });

  it('reverses and reapplies an entity creation at its authored position', () => {
    const created = structuredClone(story);
    created.interactions.push({
      id: 'interaction-2',
      title: 'Next',
      body: '',
      position: { x: 10, y: 200 },
      triggers: [],
    });
    const delta = createStoryChangeDelta(story, created)!;

    const undone = applyStoryChangeDelta(created, delta, 'backward');
    expect(undone.applied && undone.story.interactions.map(({ id }) => id)).toEqual([
      'interaction-1',
    ]);
    if (!undone.applied) return;
    const redone = applyStoryChangeDelta(undone.story, delta, 'forward');
    expect(redone.applied && redone.story.interactions.map(({ id }) => id)).toEqual([
      'interaction-1',
      'interaction-2',
    ]);
  });

  it('reports an overlapping later change instead of overwriting it', () => {
    const changed = structuredClone(story);
    changed.interactions[0].title = 'First change';
    const delta = createStoryChangeDelta(story, changed)!;
    const later = structuredClone(changed);
    later.interactions[0].title = 'Conflicting change';

    const result = applyStoryChangeDelta(later, delta, 'backward');

    expect(result).toEqual({
      applied: false,
      conflicts: [{ path: '$.interactions[id="interaction-1"].title' }],
    });
  });

  it('preserves an unrelated later entity while reversing an authored reorder', () => {
    const before = storyWithInteractions('interaction-1', 'interaction-2', 'interaction-3');
    const reordered = storyWithInteractions('interaction-2', 'interaction-1', 'interaction-3');
    const delta = createStoryChangeDelta(before, reordered)!;
    const later = structuredClone(reordered);
    later.interactions.push(interaction('interaction-4'));

    const result = applyStoryChangeDelta(later, delta, 'backward');

    expect(result.applied && result.story.interactions.map(({ id }) => id)).toEqual([
      'interaction-1',
      'interaction-2',
      'interaction-3',
      'interaction-4',
    ]);
  });

  it('reports a later overlapping entity reorder instead of replacing it', () => {
    const before = storyWithInteractions('interaction-1', 'interaction-2', 'interaction-3');
    const reordered = storyWithInteractions('interaction-2', 'interaction-1', 'interaction-3');
    const delta = createStoryChangeDelta(before, reordered)!;
    const later = storyWithInteractions('interaction-2', 'interaction-3', 'interaction-1');

    expect(applyStoryChangeDelta(later, delta, 'backward')).toEqual({
      applied: false,
      conflicts: [{ path: '$.interactions[id="interaction-1"]' }],
    });
  });

  it('does not record access, runtime capabilities, revisions, or timestamps', () => {
    const changed = {
      ...structuredClone(story),
      revision: 9,
      updatedAt: '2026-08-28T09:00:00.000Z',
      access: { visibility: 'public', editPolicy: 'authenticated', commentPolicy: 'readers' },
      capabilities: { canRead: true, canEdit: true, canManage: true, canComment: true },
    } satisfies Story;

    expect(createStoryChangeDelta(story, changed)).toBeUndefined();
  });

  it('records and reverses 2,000 graph position changes within the history budget', () => {
    const before = storyWithInteractionCount(2_000);
    const after = structuredClone(before);
    for (const interaction of after.interactions) {
      interaction.position = {
        x: interaction.position.x + 25,
        y: interaction.position.y + 50,
      };
      interaction.triggers[0].position = {
        x: interaction.position.x,
        y: interaction.position.y - 75,
      };
    }

    const startedAt = performance.now();
    const delta = createStoryChangeDelta(before, after)!;
    const restored = applyStoryChangeDelta(after, delta, 'backward');
    const durationMs = performance.now() - startedAt;

    expect(restored.applied).toBe(true);
    if (!restored.applied) return;
    expect(restored.story.interactions.map(({ position }) => position)).toEqual(
      before.interactions.map(({ position }) => position),
    );
    expect(durationMs).toBeLessThan(2_000);
  });
});

function storyWithInteractions(...ids: string[]): Story {
  return { ...structuredClone(story), interactions: ids.map(interaction) };
}

function interaction(id: string): Story['interactions'][number] {
  return {
    id,
    title: id,
    body: '',
    position: { x: 0, y: 0 },
    triggers: [],
  };
}

function storyWithInteractionCount(count: number): Story {
  return {
    ...structuredClone(story),
    interactions: Array.from({ length: count }, (_, index) => ({
      id: `interaction-${index}`,
      title: `Interaction ${index}`,
      body: `Body ${index}`,
      position: { x: index * 10, y: index * 20 },
      triggers: [
        {
          id: `trigger-${index}`,
          inputInteractionIds: index === 0 ? [] : [`interaction-${index - 1}`],
          conditions: [],
        },
      ],
    })),
  };
}
