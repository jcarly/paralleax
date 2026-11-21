import type { StatOwnerType } from './targets.js';

export type StatItemTargetIssue =
  'non_item_with_instance' | 'item_without_instance' | 'item_definition_mismatch';

/** Check the same ownership rule for authored conditions, effects and rich text. */
export function statItemTargetIssue(input: {
  ownerType: StatOwnerType;
  ownerId?: string;
  itemId?: string;
  itemDefinitionId?: string;
}): StatItemTargetIssue | undefined {
  if (input.ownerType !== 'itemDefinition') {
    return input.itemId !== undefined && input.itemId.length > 0
      ? 'non_item_with_instance'
      : undefined;
  }
  if (input.itemId === undefined || input.itemId.length === 0) {
    return 'item_without_instance';
  }
  if (input.itemDefinitionId === undefined || input.itemDefinitionId !== input.ownerId) {
    return 'item_definition_mismatch';
  }
  return undefined;
}
