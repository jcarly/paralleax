import { describe, expect, it } from 'vitest';
import type { ItemInstance, Story } from '../model/index.js';
import {
  getItemDescendantIds,
  getStructurallyPlacedItemInstances,
  groupItemInstancesByParent,
  moveItemInstanceInStory,
} from './graph.js';

describe('item graph operations', () => {
  it('indexes children and collects every descendant once', () => {
    const items: ItemInstance[] = [
      { id: 'bag', itemDefinitionId: 'bag-definition' },
      {
        id: 'key',
        itemDefinitionId: 'key-definition',
        parentItemId: 'bag',
        relationshipType: 'contained',
      },
      {
        id: 'charm',
        itemDefinitionId: 'charm-definition',
        parentItemId: 'key',
        relationshipType: 'attached',
      },
    ];

    expect(groupItemInstancesByParent(items).get('bag')).toEqual([items[1]]);
    expect(getItemDescendantIds(items, 'bag')).toEqual(new Set(['key', 'charm']));
  });

  it('resolves only instances connected to a character or location root', () => {
    const story = storyFixture();
    story.characters![0].items!.push(
      {
        id: 'orphan',
        itemDefinitionId: 'orphan-definition',
        parentItemId: 'missing',
        relationshipType: 'contained',
      },
      {
        id: 'cycle-a',
        itemDefinitionId: 'cycle-definition',
        parentItemId: 'cycle-b',
        relationshipType: 'contained',
      },
      {
        id: 'cycle-b',
        itemDefinitionId: 'cycle-definition',
        parentItemId: 'cycle-a',
        relationshipType: 'contained',
      },
    );

    expect(
      getStructurallyPlacedItemInstances(story).map(({ ownerType, ownerId, item }) => [
        ownerType,
        ownerId,
        item.id,
      ]),
    ).toEqual([
      ['character', 'mira', 'bag'],
      ['character', 'mira', 'key'],
      ['location', 'park', 'cabinet'],
    ]);
  });

  it('moves a complete subtree without mutating the source story', () => {
    const story = storyFixture();
    const result = moveItemInstanceInStory(story, 'bag', { locationId: 'park' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(story.characters![0].items).toHaveLength(2);
    expect(result.story.characters![0].items).toEqual([]);
    expect(result.story.locations![0].items).toEqual([
      { id: 'cabinet', itemDefinitionId: 'cabinet-definition' },
      { id: 'bag', itemDefinitionId: 'bag-definition' },
      {
        id: 'key',
        itemDefinitionId: 'key-definition',
        parentItemId: 'bag',
        relationshipType: 'contained',
        slotKey: 'main',
      },
    ]);
  });

  it('updates or clears relationship metadata when placement changes', () => {
    const story = storyFixture();
    const nested = moveItemInstanceInStory(story, 'cabinet', {
      parentItemId: 'bag',
      relationshipType: 'attached',
      slotKey: 'side',
    });
    expect(nested.ok && nested.story.characters![0].items?.at(-1)).toMatchObject({
      id: 'cabinet',
      parentItemId: 'bag',
      relationshipType: 'attached',
      slotKey: 'side',
    });

    if (!nested.ok) return;
    const rooted = moveItemInstanceInStory(nested.story, 'cabinet', { characterId: 'luc' });
    expect(rooted.ok && rooted.story.characters![1].items).toEqual([
      { id: 'cabinet', itemDefinitionId: 'cabinet-definition' },
    ]);
  });

  it('rejects invalid targets, missing relationships, and ancestor cycles', () => {
    const story = storyFixture();

    expect(moveItemInstanceInStory(story, 'missing', { characterId: 'mira' })).toEqual({
      ok: false,
      error: 'item-not-found',
    });
    expect(moveItemInstanceInStory(story, 'bag', {})).toEqual({
      ok: false,
      error: 'invalid-target-count',
    });
    expect(
      moveItemInstanceInStory(story, 'bag', { characterId: 'mira', locationId: 'park' }),
    ).toEqual({ ok: false, error: 'invalid-target-count' });
    expect(moveItemInstanceInStory(story, 'cabinet', { parentItemId: 'bag' })).toEqual({
      ok: false,
      error: 'relationship-required',
    });
    expect(
      moveItemInstanceInStory(story, 'bag', {
        parentItemId: 'key',
        relationshipType: 'contained',
      }),
    ).toEqual({ ok: false, error: 'cycle' });
    expect(
      moveItemInstanceInStory(story, 'bag', {
        parentItemId: 'foreign',
        relationshipType: 'contained',
      }),
    ).toEqual({ ok: false, error: 'parent-not-found' });
    expect(
      moveItemInstanceInStory(story, 'bag', {
        characterId: 'mira',
        relationshipType: 'contained',
      }),
    ).toEqual({ ok: false, error: 'root-relationship-metadata' });
  });
});

function storyFixture(): Story {
  return {
    id: 'story',
    title: 'Story',
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
    interactions: [],
    characters: [
      {
        id: 'mira',
        name: 'Mira',
        description: '',
        items: [
          { id: 'bag', itemDefinitionId: 'bag-definition' },
          {
            id: 'key',
            itemDefinitionId: 'key-definition',
            parentItemId: 'bag',
            relationshipType: 'contained',
            slotKey: 'main',
          },
        ],
      },
      { id: 'luc', name: 'Luc', description: '' },
    ],
    locations: [
      {
        id: 'park',
        name: 'Park',
        description: '',
        items: [{ id: 'cabinet', itemDefinitionId: 'cabinet-definition' }],
      },
    ],
  };
}
