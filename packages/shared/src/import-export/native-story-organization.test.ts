import { describe, expect, it } from 'vitest';
import { checkNativeStoryGroupsAndItemReachability } from './native-story-organization.js';
import type { NativeStoryContent } from './native-story.js';

function story(): NativeStoryContent {
  return {
    title: 'Story',
    itemDefinitions: [{ id: 'd', name: 'Item', description: '' }],
    interactions: [{ id: 'i', title: '', body: '', position: { x: 0, y: 0 }, triggers: [] }],
    groups: [{ id: 'g', title: 'Group', interactionIds: ['i'] }],
    locations: [
      {
        id: 'l',
        name: 'Room',
        description: '',
        items: [
          { id: 'root', itemDefinitionId: 'd' },
          {
            id: 'child',
            itemDefinitionId: 'd',
            parentItemId: 'root',
            relationshipType: 'contained',
          },
        ],
      },
    ],
  };
}

describe('native Story organization checks', () => {
  it('accepts an existing valid group and reachable item tree', () => {
    expect(checkNativeStoryGroupsAndItemReachability(story())).toBeUndefined();
  });

  it('reuses group membership validation', () => {
    const input = story();
    input.groups?.push({ id: 'other', title: 'Other', interactionIds: ['i'] });
    expect(checkNativeStoryGroupsAndItemReachability(input)).toMatchObject({
      code: 'INVALID_GROUPS',
      path: '$.story.groups',
    });
  });

  it('rejects cyclic or missing item parents', () => {
    const input = story();
    const items = input.locations?.[0].items;
    if (!items) {
      throw new Error('Missing fixture items');
    }
    items[0].parentItemId = 'child';
    expect(checkNativeStoryGroupsAndItemReachability(input)).toMatchObject({
      code: 'INVALID_ITEM_PLACEMENT',
    });
    items[0].parentItemId = 'missing';
    expect(checkNativeStoryGroupsAndItemReachability(input)).toMatchObject({
      code: 'INVALID_ITEM_PLACEMENT',
    });
  });

  it('rejects a foreign item definition and relationship metadata on a root', () => {
    const input = story();
    const item = input.locations?.[0].items?.[0];
    if (!item) {
      throw new Error('Missing fixture item');
    }
    item.itemDefinitionId = 'missing';
    expect(checkNativeStoryGroupsAndItemReachability(input)).toMatchObject({
      code: 'INVALID_ITEM_DEFINITION',
      path: '$.story.locations[0].items[0].itemDefinitionId',
    });
    item.itemDefinitionId = 'd';
    item.relationshipType = 'contained';
    expect(checkNativeStoryGroupsAndItemReachability(input)).toMatchObject({
      code: 'INVALID_ITEM_PLACEMENT',
      path: '$.story.locations[0].items[0]',
    });
  });
});
