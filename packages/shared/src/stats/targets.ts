import { getStoryItemEntries, type StoryItemEntry } from '../items/graph.js';
import type {
  ItemDefinition,
  ItemInstance,
  StatAssignment,
  StatDefinition,
  Story,
} from '../model/index.js';

export type StatOwnerType = 'story' | 'character' | 'location' | 'itemDefinition';

export interface StatAssignmentOwner {
  ownerType: StatOwnerType;
  ownerId?: string;
  ownerName?: string;
  assignments: StatAssignment[];
}

export interface StatTarget {
  assignment: StatAssignment;
  definition?: StatDefinition;
  ownerType: StatOwnerType;
  ownerId?: string;
  ownerName?: string;
  itemId?: string;
  itemName?: string;
  itemCopyNumber?: string;
  itemPathNames?: string[];
  instanceOwnerName?: string;
}

export function getStatAssignmentOwners(story: Story): StatAssignmentOwner[] {
  return [
    { ownerType: 'story', assignments: story.stats ?? [] },
    ...(story.characters ?? []).map((character) => ({
      ownerType: 'character' as const,
      ownerId: character.id,
      ownerName: character.name,
      assignments: character.stats ?? [],
    })),
    ...(story.locations ?? []).map((location) => ({
      ownerType: 'location' as const,
      ownerId: location.id,
      ownerName: location.name,
      assignments: location.stats ?? [],
    })),
    ...(story.itemDefinitions ?? []).map((definition) => ({
      ownerType: 'itemDefinition' as const,
      ownerId: definition.id,
      ownerName: definition.name,
      assignments: definition.stats ?? [],
    })),
  ];
}

export function getStatTargets(story: Story): StatTarget[] {
  const definitions = new Map(
    (story.statDefinitions ?? []).map((definition) => [definition.id, definition]),
  );
  const nonItemTargets = getStatAssignmentOwners(story)
    .filter(({ ownerType }) => ownerType !== 'itemDefinition')
    .flatMap((owner) =>
      owner.assignments.map((assignment) => ({
        assignment,
        definition: definitions.get(assignment.statDefinitionId),
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        ownerName: owner.ownerName,
      })),
    );
  const itemDefinitions = new Map(
    (story.itemDefinitions ?? []).map((definition) => [definition.id, definition]),
  );
  const itemEntries = getStoryItemEntries(story);
  const itemTargets = itemEntries.flatMap(({ ownerType, ownerId, item }) => {
    const itemDefinition = itemDefinitions.get(item.itemDefinitionId);
    const ownerEntries = itemEntries.filter(
      (entry) => entry.ownerType === ownerType && entry.ownerId === ownerId,
    );
    const instanceOwnerName =
      ownerType === 'character'
        ? story.characters?.find(({ id }) => id === ownerId)?.name
        : story.locations?.find(({ id }) => id === ownerId)?.name;
    return (itemDefinition?.stats ?? []).map((assignment) => ({
      assignment,
      definition: definitions.get(assignment.statDefinitionId),
      ownerType: 'itemDefinition' as const,
      ownerId: itemDefinition?.id,
      ownerName: itemDefinition?.name,
      itemId: item.id,
      itemName: itemDefinition?.name,
      itemCopyNumber: getItemCopyNumber(ownerEntries, item),
      itemPathNames: getItemPathNames(ownerEntries, item, itemDefinitions),
      instanceOwnerName,
    }));
  });
  return [...nonItemTargets, ...itemTargets];
}

export function hasStatTargets(story: Story): boolean {
  if (
    (story.stats?.length ?? 0) > 0 ||
    story.characters?.some((character) => (character.stats?.length ?? 0) > 0) ||
    story.locations?.some((location) => (location.stats?.length ?? 0) > 0)
  ) {
    return true;
  }
  const assignedItemDefinitionIds = new Set(
    (story.itemDefinitions ?? [])
      .filter((definition) => (definition.stats?.length ?? 0) > 0)
      .map(({ id }) => id),
  );
  return getStoryItemEntries(story).some(({ item }) =>
    assignedItemDefinitionIds.has(item.itemDefinitionId),
  );
}

export function resolveStatInterpolationTarget(
  story: Story,
  expression: string,
): StatTarget | undefined {
  const parts = expression.split('.').map(normalizeReferencePart);
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) return undefined;
  const [ownerReference, statReference] = parts;
  const matches = getStatTargets(story).filter(
    (target) =>
      matchesOwnerReference(story, target, ownerReference) &&
      matchesStatReference(target, statReference),
  );
  const uniqueTargets = new Map(
    matches.map((target) => [`${target.itemId ?? ''}:${target.assignment.id}`, target]),
  );
  return uniqueTargets.size === 1 ? [...uniqueTargets.values()][0] : undefined;
}

function matchesOwnerReference(story: Story, target: StatTarget, reference: string): boolean {
  if (target.ownerType === 'story') {
    return reference === 'story' || reference === normalizeReferencePart(story.id);
  }
  if (target.itemId) return reference === normalizeReferencePart(target.itemId);
  return [target.ownerId, target.ownerName].some(
    (candidate) => candidate !== undefined && normalizeReferencePart(candidate) === reference,
  );
}

function matchesStatReference(target: StatTarget, reference: string): boolean {
  return [
    target.assignment.id,
    target.assignment.statDefinitionId,
    target.definition?.id,
    target.definition?.name,
  ].some((candidate) => candidate !== undefined && normalizeReferencePart(candidate) === reference);
}

function normalizeReferencePart(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function getItemCopyNumber(entries: readonly StoryItemEntry[], item: ItemInstance): string {
  const matchingItems = entries.filter(
    (entry) => entry.item.itemDefinitionId === item.itemDefinitionId,
  );
  return matchingItems.length > 1
    ? ` #${matchingItems.findIndex((entry) => entry.item.id === item.id) + 1}`
    : '';
}

function getItemPathNames(
  entries: readonly StoryItemEntry[],
  item: ItemInstance,
  definitions: ReadonlyMap<string, ItemDefinition>,
): string[] {
  const entriesByItemId = new Map(entries.map((entry) => [entry.item.id, entry]));
  const pathNames: string[] = [];
  const visitedItemIds = new Set<string>();
  let currentItem: ItemInstance | undefined = item;

  while (currentItem && !visitedItemIds.has(currentItem.id)) {
    visitedItemIds.add(currentItem.id);
    const definition = definitions.get(currentItem.itemDefinitionId);
    pathNames.unshift(
      `${definition?.name ?? currentItem.itemDefinitionId}${getItemCopyNumber(entries, currentItem)}`,
    );
    currentItem = currentItem.parentItemId
      ? entriesByItemId.get(currentItem.parentItemId)?.item
      : undefined;
  }

  return pathNames;
}
