import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  moveItemInstanceInStory,
  type MoveItemInstanceError,
  type MoveItemInstanceInput,
  type Story,
} from '@paralleax/shared';

export function moveStoryItemInstance(
  story: Story,
  itemId: string,
  placement: MoveItemInstanceInput,
): Story {
  const result = moveItemInstanceInStory(story, itemId, placement);
  if (result.ok) return result.story;
  throw itemPlacementException(result.error);
}

function itemPlacementException(error: MoveItemInstanceError): Error {
  switch (error) {
    case 'item-not-found':
      return new NotFoundException('Item instance not found');
    case 'invalid-target-count':
      return new BadRequestException(
        'An item placement must target exactly one character, location, or parent item',
      );
    case 'character-not-found':
      return new NotFoundException('Character not found');
    case 'location-not-found':
      return new NotFoundException('Location not found');
    case 'relationship-required':
      return new BadRequestException('A parent item placement requires a relationship type');
    case 'cycle':
      return new BadRequestException('An item cannot become a descendant of itself');
    case 'parent-not-found':
      return new BadRequestException('Parent item must belong to the same story');
    case 'root-relationship-metadata':
      return new BadRequestException(
        'Relationship type and slot are only valid for a parent item placement',
      );
  }
}
