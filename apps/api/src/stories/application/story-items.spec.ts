import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { MoveItemInstanceInput, Story } from '@paralleax/shared';
import { moveStoryItemInstance } from './story-items';

describe('moveStoryItemInstance', () => {
  it('returns the story produced by the shared item graph operation', () => {
    const moved = moveStoryItemInstance(storyFixture(), 'bag', { locationId: 'park' });

    expect(moved.characters?.[0].items).toEqual([]);
    expect(moved.locations?.[0].items).toEqual([
      { id: 'bag', itemDefinitionId: 'bag-definition' },
      {
        id: 'key',
        itemDefinitionId: 'key-definition',
        parentItemId: 'bag',
        relationshipType: 'contained',
      },
    ]);
  });

  it.each<{
    itemId: string;
    placement: MoveItemInstanceInput;
    exception: typeof BadRequestException | typeof NotFoundException;
    message: string;
  }>([
    {
      itemId: 'missing',
      placement: { characterId: 'mira' },
      exception: NotFoundException,
      message: 'Item instance not found',
    },
    {
      itemId: 'bag',
      placement: {},
      exception: BadRequestException,
      message: 'An item placement must target exactly one character, location, or parent item',
    },
    {
      itemId: 'bag',
      placement: { characterId: 'missing' },
      exception: NotFoundException,
      message: 'Character not found',
    },
    {
      itemId: 'bag',
      placement: { locationId: 'missing' },
      exception: NotFoundException,
      message: 'Location not found',
    },
    {
      itemId: 'bag',
      placement: { parentItemId: 'key' },
      exception: BadRequestException,
      message: 'A parent item placement requires a relationship type',
    },
    {
      itemId: 'bag',
      placement: { parentItemId: 'key', relationshipType: 'contained' },
      exception: BadRequestException,
      message: 'An item cannot become a descendant of itself',
    },
    {
      itemId: 'bag',
      placement: { parentItemId: 'missing', relationshipType: 'contained' },
      exception: BadRequestException,
      message: 'Parent item must belong to the same story',
    },
    {
      itemId: 'bag',
      placement: { characterId: 'mira', relationshipType: 'contained' },
      exception: BadRequestException,
      message: 'Relationship type and slot are only valid for a parent item placement',
    },
  ])('maps $message to the API boundary', ({ itemId, placement, exception, message }) => {
    expect(() => moveStoryItemInstance(storyFixture(), itemId, placement)).toThrow(exception);
    expect(() => moveStoryItemInstance(storyFixture(), itemId, placement)).toThrow(message);
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
          },
        ],
      },
    ],
    locations: [{ id: 'park', name: 'Park', description: '' }],
  };
}
