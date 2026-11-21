import {
  getStoryItemEntries,
  getStructurallyPlacedItemInstances,
  validateItemPlacementShape,
} from '../items/graph.js';
import { validateStoryGroups } from '../operations/groups.js';
import type { ItemInstance } from '../model/items.js';
import type { NativeStoryContent } from './native-story.js';

export type NativeStoryOrganizationError =
  | { code: 'INVALID_GROUPS'; path: '$.story.groups'; message: string }
  | { code: 'INVALID_ITEM_PLACEMENT' | 'INVALID_ITEM_DEFINITION'; path: string; message: string };

/** Reuse existing organization rules after structural and identifier validation. */
export function checkNativeStoryGroupsAndItemReachability(
  story: NativeStoryContent,
): NativeStoryOrganizationError | undefined {
  const groupError = validateStoryGroups(story);
  if (groupError !== undefined) {
    return { code: 'INVALID_GROUPS', path: '$.story.groups', message: groupError };
  }
  const itemError = checkItems(story);
  if (itemError !== undefined) {
    return itemError;
  }
  if (getStoryItemEntries(story).length !== getStructurallyPlacedItemInstances(story).length) {
    return {
      code: 'INVALID_ITEM_PLACEMENT',
      path: '$.story',
      message: 'Every item must be reachable from an owner without a cycle or missing parent',
    };
  }
  return undefined;
}

function checkItems(story: NativeStoryContent): NativeStoryOrganizationError | undefined {
  const definitions = new Set((story.itemDefinitions ?? []).map(({ id }) => id));
  const owners = [
    ...(story.characters ?? []).map((owner, index) => ({
      owner,
      path: `$.story.characters[${index}].items`,
      root: { characterId: owner.id },
    })),
    ...(story.locations ?? []).map((owner, index) => ({
      owner,
      path: `$.story.locations[${index}].items`,
      root: { locationId: owner.id },
    })),
  ];
  for (const { owner, path, root } of owners) {
    for (const [index, item] of (owner.items ?? []).entries()) {
      const itemPath = `${path}[${index}]`;
      const issue = checkItem(item, itemPath, root, definitions);
      if (issue !== undefined) {
        return issue;
      }
    }
  }
  return undefined;
}

function checkItem(
  item: ItemInstance,
  path: string,
  root: { characterId: string } | { locationId: string },
  definitions: ReadonlySet<string>,
): NativeStoryOrganizationError | undefined {
  if (!definitions.has(item.itemDefinitionId)) {
    return {
      code: 'INVALID_ITEM_DEFINITION',
      path: `${path}.itemDefinitionId`,
      message: 'Item definition must belong to the Story',
    };
  }
  const target = item.parentItemId === undefined ? root : { parentItemId: item.parentItemId };
  const problem = validateItemPlacementShape({
    ...target,
    relationshipType: item.relationshipType,
    slotKey: item.slotKey,
  });
  return problem === undefined
    ? undefined
    : { code: 'INVALID_ITEM_PLACEMENT', path, message: problem };
}
