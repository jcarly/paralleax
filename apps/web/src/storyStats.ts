import {
  getStatValueType,
  type StatAssignment,
  type StatDefinition,
  type Story,
} from '@paralleax/shared';

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
  const itemTargets = [...(story.characters ?? []), ...(story.locations ?? [])].flatMap((owner) =>
    (owner.items ?? []).flatMap((item) => {
      const itemDefinition = itemDefinitions.get(item.itemDefinitionId);
      const matchingItems = (owner.items ?? []).filter(
        ({ itemDefinitionId }) => itemDefinitionId === item.itemDefinitionId,
      );
      const itemCopyNumber =
        matchingItems.length > 1
          ? ` #${matchingItems.findIndex(({ id }) => id === item.id) + 1}`
          : '';
      return (itemDefinition?.stats ?? []).map((assignment) => ({
        assignment,
        definition: definitions.get(assignment.statDefinitionId),
        ownerType: 'itemDefinition' as const,
        ownerId: itemDefinition?.id,
        ownerName: itemDefinition?.name,
        itemId: item.id,
        itemName: itemDefinition?.name,
        itemCopyNumber,
        instanceOwnerName: owner.name,
      }));
    }),
  );
  return [...nonItemTargets, ...itemTargets];
}

export function statTargetValueType(target: StatTarget) {
  return target.definition ? getStatValueType(target.definition) : 'number';
}

export function statTargetId(target: StatTarget) {
  return `${target.itemId ?? ''}:${target.assignment.id}`;
}

export function statTargetLabel(target: StatTarget, storyLabel: string) {
  const statName = target.definition?.name ?? target.assignment.statDefinitionId;
  if (target.itemId) {
    return `${target.instanceOwnerName ?? target.itemId} — ${target.itemName ?? target.ownerName ?? target.itemId}${target.itemCopyNumber ?? ''} — ${statName}`;
  }
  return `${target.ownerName ?? storyLabel} — ${statName}`;
}
