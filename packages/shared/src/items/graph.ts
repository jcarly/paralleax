import type { ItemInstance, MoveItemInstanceInput, Story } from '../model/index.js';

export type StoryItemOwnerType = 'character' | 'location';

export interface StoryItemEntry {
  ownerType: StoryItemOwnerType;
  ownerId: string;
  item: ItemInstance;
  sortOrder: number;
}

export type MoveItemInstanceError =
  | 'item-not-found'
  | 'invalid-target-count'
  | 'character-not-found'
  | 'location-not-found'
  | 'relationship-required'
  | 'cycle'
  | 'parent-not-found'
  | 'root-relationship-metadata';

export type MoveItemInstanceResult =
  { ok: true; story: Story } | { ok: false; error: MoveItemInstanceError };

export function getStoryItemEntries(story: Story): StoryItemEntry[] {
  return [
    ...(story.characters ?? []).flatMap((character) =>
      (character.items ?? []).map((item, sortOrder) => ({
        ownerType: 'character' as const,
        ownerId: character.id,
        item,
        sortOrder,
      })),
    ),
    ...(story.locations ?? []).flatMap((location) =>
      (location.items ?? []).map((item, sortOrder) => ({
        ownerType: 'location' as const,
        ownerId: location.id,
        item,
        sortOrder,
      })),
    ),
  ];
}

export function groupItemInstancesByParent(
  items: readonly ItemInstance[],
): Map<string, ItemInstance[]> {
  const childrenByParent = new Map<string, ItemInstance[]>();
  for (const item of items) {
    if (!item.parentItemId) continue;
    const siblings = childrenByParent.get(item.parentItemId);
    if (siblings) siblings.push(item);
    else childrenByParent.set(item.parentItemId, [item]);
  }
  return childrenByParent;
}

export function getItemDescendantIds(items: readonly ItemInstance[], itemId: string): Set<string> {
  const childrenByParent = groupItemInstancesByParent(items);
  const visited = new Set([itemId]);
  const descendants = new Set<string>();
  const pending = [...(childrenByParent.get(itemId) ?? [])];
  while (pending.length > 0) {
    const child = pending.pop();
    if (!child || visited.has(child.id)) continue;
    visited.add(child.id);
    descendants.add(child.id);
    pending.push(...(childrenByParent.get(child.id) ?? []));
  }
  return descendants;
}

export function getStructurallyPlacedItemInstances(story: Story): StoryItemEntry[] {
  const ownerEntries = [
    ...(story.characters ?? []).map((character) => ({
      ownerType: 'character' as const,
      ownerId: character.id,
      items: character.items ?? [],
    })),
    ...(story.locations ?? []).map((location) => ({
      ownerType: 'location' as const,
      ownerId: location.id,
      items: location.items ?? [],
    })),
  ];

  return ownerEntries.flatMap(({ ownerType, ownerId, items }) => {
    const childrenByParent = groupItemInstancesByParent(items);
    const reachableIds = new Set<string>();
    const pending = items.filter((item) => !item.parentItemId);
    while (pending.length > 0) {
      const item = pending.pop();
      if (!item || reachableIds.has(item.id)) continue;
      reachableIds.add(item.id);
      pending.push(...(childrenByParent.get(item.id) ?? []));
    }

    return items.flatMap((item, sortOrder) =>
      reachableIds.has(item.id) ? [{ ownerType, ownerId, item, sortOrder }] : [],
    );
  });
}

export function moveItemInstanceInStory(
  story: Story,
  itemId: string,
  placement: MoveItemInstanceInput,
): MoveItemInstanceResult {
  const entries = getStoryItemEntries(story);
  const moving = entries.find(({ item }) => item.id === itemId);
  if (!moving) return { ok: false, error: 'item-not-found' };

  const targetCount =
    Number(Boolean(placement.characterId)) +
    Number(Boolean(placement.locationId)) +
    Number(Boolean(placement.parentItemId));
  if (targetCount !== 1) return { ok: false, error: 'invalid-target-count' };

  const subtreeIds = new Set([
    itemId,
    ...getItemDescendantIds(
      entries.map(({ item }) => item),
      itemId,
    ),
  ]);

  let targetOwner: Pick<StoryItemEntry, 'ownerType' | 'ownerId'>;
  if (placement.parentItemId) {
    if (!placement.relationshipType) return { ok: false, error: 'relationship-required' };
    if (subtreeIds.has(placement.parentItemId)) return { ok: false, error: 'cycle' };
    const parent = entries.find(({ item }) => item.id === placement.parentItemId);
    if (!parent) return { ok: false, error: 'parent-not-found' };
    targetOwner = parent;
  } else {
    if (placement.relationshipType || placement.slotKey) {
      return { ok: false, error: 'root-relationship-metadata' };
    }
    if (placement.characterId) {
      const character = story.characters?.find(({ id }) => id === placement.characterId);
      if (!character) return { ok: false, error: 'character-not-found' };
      targetOwner = { ownerType: 'character', ownerId: character.id };
    } else {
      const location = story.locations?.find(({ id }) => id === placement.locationId);
      if (!location) return { ok: false, error: 'location-not-found' };
      targetOwner = { ownerType: 'location', ownerId: location.id };
    }
  }

  const subtree = entries
    .filter(({ item }) => subtreeIds.has(item.id))
    .map(({ item }) => (item.id === itemId ? applyItemPlacement(item, placement) : item));
  const withoutSubtree = (items: readonly ItemInstance[] | undefined) =>
    (items ?? []).filter(({ id }) => !subtreeIds.has(id));

  return {
    ok: true,
    story: {
      ...story,
      ...(story.characters
        ? {
            characters: story.characters.map((character) => ({
              ...character,
              items:
                targetOwner.ownerType === 'character' && targetOwner.ownerId === character.id
                  ? [...withoutSubtree(character.items), ...subtree]
                  : withoutSubtree(character.items),
            })),
          }
        : {}),
      ...(story.locations
        ? {
            locations: story.locations.map((location) => ({
              ...location,
              items:
                targetOwner.ownerType === 'location' && targetOwner.ownerId === location.id
                  ? [...withoutSubtree(location.items), ...subtree]
                  : withoutSubtree(location.items),
            })),
          }
        : {}),
    },
  };
}

function applyItemPlacement(item: ItemInstance, placement: MoveItemInstanceInput): ItemInstance {
  if (!placement.parentItemId) {
    const root = { ...item };
    delete root.parentItemId;
    delete root.relationshipType;
    delete root.slotKey;
    return root;
  }

  const nested: ItemInstance = {
    ...item,
    parentItemId: placement.parentItemId,
    relationshipType: placement.relationshipType,
  };
  if (placement.slotKey) nested.slotKey = placement.slotKey;
  else delete nested.slotKey;
  return nested;
}
