import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  getStoryItemEntries,
  getStatValueType,
  isStatValueOfType,
  type StatAssignment,
  type StatComparisonOperator,
  type StatCondition,
  type StatDefinition,
  type StatEffect,
  type StatValue,
  type StatValueType,
  type Story,
} from '@paralleax/shared';

export type StatOwnerType = 'story' | 'character' | 'location' | 'itemDefinition';

type StatDefinitionInput = {
  name: string;
  valueType: StatValueType;
  category?: string;
  imageUrl?: string;
  changePerHour?: number;
};

type StatAssignmentInput = {
  statDefinitionId: string;
  ownerType: StatOwnerType;
  ownerId?: string;
  initialValue: unknown;
};

export type StatAssignmentReference = {
  assignment: StatAssignment;
  ownerType: StatOwnerType;
  ownerId?: string;
};

export function createStatDefinition(
  story: Story,
  id: string,
  input: StatDefinitionInput,
): StatDefinition {
  const name = input.name.trim();
  if (!name) throw new BadRequestException('Stat name cannot be blank');
  if (input.valueType !== 'number' && input.changePerHour) {
    throw new BadRequestException('Only numeric stats can change over time');
  }
  const definition: StatDefinition = {
    id,
    name,
    valueType: input.valueType,
    ...(input.category?.trim() ? { category: input.category.trim() } : {}),
    ...(input.imageUrl?.trim() ? { imageUrl: input.imageUrl.trim() } : {}),
    ...(input.valueType === 'number' && input.changePerHour
      ? { changePerHour: input.changePerHour }
      : {}),
  };
  (story.statDefinitions ??= []).push(definition);
  return definition;
}

export function updateStatDefinition(
  story: Story,
  id: string,
  input: { name?: string; category?: string; imageUrl?: string; changePerHour?: number },
): StatDefinition {
  const definition = findStatDefinition(story, id);
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Stat name cannot be blank');
    definition.name = name;
  }
  if (input.category !== undefined) {
    const category = input.category.trim();
    if (category) definition.category = category;
    else delete definition.category;
  }
  if (input.imageUrl !== undefined) {
    const imageUrl = input.imageUrl.trim();
    if (imageUrl) definition.imageUrl = imageUrl;
    else delete definition.imageUrl;
  }
  if (input.changePerHour !== undefined) {
    if (getStatValueType(definition) !== 'number' && input.changePerHour !== 0) {
      throw new BadRequestException('Only numeric stats can change over time');
    }
    if (input.changePerHour) definition.changePerHour = input.changePerHour;
    else delete definition.changePerHour;
  }
  return definition;
}

export function deleteStatDefinition(story: Story, id: string) {
  findStatDefinition(story, id);
  const assignmentIds = new Set(
    getStatAssignments(story)
      .filter(({ assignment }) => assignment.statDefinitionId === id)
      .map(({ assignment }) => assignment.id),
  );
  story.statDefinitions = (story.statDefinitions ?? []).filter(
    (definition) => definition.id !== id,
  );
  removeStatAssignments(story, assignmentIds);
}

export function createStatAssignment(
  story: Story,
  id: string,
  input: StatAssignmentInput,
): StatAssignment {
  const definition = findStatDefinition(story, input.statDefinitionId);
  const initialValue = assertStatValue(input.initialValue, definition);
  const assignments = ownerAssignments(story, input.ownerType, input.ownerId);
  if (assignments.some(({ statDefinitionId }) => statDefinitionId === input.statDefinitionId)) {
    throw new BadRequestException('An owner can only assign a stat once');
  }
  const assignment = { id, statDefinitionId: definition.id, initialValue };
  assignments.push(assignment);
  return assignment;
}

export function updateStatAssignment(
  story: Story,
  id: string,
  initialValue: unknown,
): StatAssignment {
  const reference = findStatAssignment(story, id);
  const definition = findStatDefinition(story, reference.assignment.statDefinitionId);
  reference.assignment.initialValue = assertStatValue(initialValue, definition);
  return reference.assignment;
}

export function deleteStatAssignment(story: Story, id: string) {
  findStatAssignment(story, id);
  removeStatAssignments(story, new Set([id]));
}

export function validateStatEffects(
  story: Story,
  effects: Array<{ statId: string; itemId?: string; operation: 'add' | 'set'; value: unknown }>,
): StatEffect[] {
  const targets = new Set<string>();
  return effects.map((effect) => {
    const reference = validateStatAssignmentReference(story, effect.statId);
    assertItemTarget(story, reference, effect.itemId);
    const definition = findStatDefinition(story, reference.assignment.statDefinitionId);
    const value = assertStatValue(effect.value, definition);
    if (effect.operation === 'add' && getStatValueType(definition) !== 'number') {
      throw new BadRequestException('Only numeric stats support add effects');
    }
    const target = `${effect.itemId ?? ''}:${reference.assignment.id}`;
    if (targets.has(target)) {
      throw new BadRequestException('An interaction can affect each stat target at most once');
    }
    targets.add(target);
    return {
      statId: reference.assignment.id,
      ...(effect.itemId ? { itemId: effect.itemId } : {}),
      operation: effect.operation,
      value,
    };
  });
}

export function buildStatCondition(
  story: Story,
  input: {
    statId: string;
    itemId?: string;
    operator: StatComparisonOperator;
    value: unknown;
  },
): StatCondition {
  const reference = validateStatAssignmentReference(story, input.statId);
  assertItemTarget(story, reference, input.itemId);
  const definition = findStatDefinition(story, reference.assignment.statDefinitionId);
  const value = assertStatValue(input.value, definition);
  if (getStatValueType(definition) !== 'number' && !['eq', 'neq'].includes(input.operator)) {
    throw new BadRequestException('Boolean and string stats only support equality checks');
  }
  return {
    statId: reference.assignment.id,
    ...(input.itemId ? { itemId: input.itemId } : {}),
    operator: input.operator,
    value,
  };
}

export function findStatDefinition(story: Story, id: string): StatDefinition {
  const definition = (story.statDefinitions ?? []).find((candidate) => candidate.id === id);
  if (!definition) throw new NotFoundException('Stat definition not found');
  return definition;
}

export function findStatAssignment(story: Story, id: string): StatAssignmentReference {
  const reference = getStatAssignments(story).find(({ assignment }) => assignment.id === id);
  if (!reference) throw new NotFoundException('Stat assignment not found');
  return reference;
}

export function getStatAssignments(story: Story): StatAssignmentReference[] {
  return [
    ...(story.stats ?? []).map((assignment) => ({ assignment, ownerType: 'story' as const })),
    ...(story.characters ?? []).flatMap((character) =>
      (character.stats ?? []).map((assignment) => ({
        assignment,
        ownerType: 'character' as const,
        ownerId: character.id,
      })),
    ),
    ...(story.locations ?? []).flatMap((location) =>
      (location.stats ?? []).map((assignment) => ({
        assignment,
        ownerType: 'location' as const,
        ownerId: location.id,
      })),
    ),
    ...(story.itemDefinitions ?? []).flatMap((definition) =>
      (definition.stats ?? []).map((assignment) => ({
        assignment,
        ownerType: 'itemDefinition' as const,
        ownerId: definition.id,
      })),
    ),
  ];
}

function validateStatAssignmentReference(story: Story, id: string): StatAssignmentReference {
  const reference = getStatAssignments(story).find(({ assignment }) => assignment.id === id);
  if (!reference) {
    throw new BadRequestException('Stat references must belong to the same story');
  }
  return reference;
}

function ownerAssignments(
  story: Story,
  ownerType: StatOwnerType,
  ownerId?: string,
): StatAssignment[] {
  if (ownerType === 'story') {
    if (ownerId !== undefined) throw new BadRequestException('Story stats do not use an owner id');
    return (story.stats ??= []);
  }
  if (!ownerId) throw new BadRequestException('Stat owner id is required');
  if (ownerType === 'character') {
    const owner = (story.characters ?? []).find(({ id }) => id === ownerId);
    if (!owner) throw new BadRequestException('Stat owner must belong to the same story');
    return (owner.stats ??= []);
  }
  if (ownerType === 'location') {
    const owner = (story.locations ?? []).find(({ id }) => id === ownerId);
    if (!owner) throw new BadRequestException('Stat owner must belong to the same story');
    return (owner.stats ??= []);
  }
  const owner = (story.itemDefinitions ?? []).find(({ id }) => id === ownerId);
  if (!owner) throw new BadRequestException('Stat owner must belong to the same story');
  return (owner.stats ??= []);
}

function assertItemTarget(story: Story, reference: StatAssignmentReference, itemId?: string) {
  if (reference.ownerType !== 'itemDefinition') {
    if (itemId) throw new BadRequestException('Only item stats can target an item instance');
    return;
  }
  if (!itemId) throw new BadRequestException('Item stats require an exact item instance');
  const item = getStoryItemEntries(story).find(({ item }) => item.id === itemId)?.item;
  if (!item || item.itemDefinitionId !== reference.ownerId) {
    throw new BadRequestException('Item stat target must belong to the same definition');
  }
}

function assertStatValue(value: unknown, definition: StatDefinition): StatValue {
  if (
    (typeof value !== 'number' && typeof value !== 'boolean' && typeof value !== 'string') ||
    !isStatValueOfType(value, getStatValueType(definition))
  ) {
    throw new BadRequestException(`Stat value must be a ${getStatValueType(definition)}`);
  }
  return value;
}

function removeStatAssignments(story: Story, assignmentIds: ReadonlySet<string>) {
  story.stats = (story.stats ?? []).filter(({ id }) => !assignmentIds.has(id));
  for (const character of story.characters ?? []) {
    character.stats = (character.stats ?? []).filter(({ id }) => !assignmentIds.has(id));
  }
  for (const location of story.locations ?? []) {
    location.stats = (location.stats ?? []).filter(({ id }) => !assignmentIds.has(id));
  }
  for (const definition of story.itemDefinitions ?? []) {
    definition.stats = (definition.stats ?? []).filter(({ id }) => !assignmentIds.has(id));
  }
  for (const interaction of story.interactions) {
    interaction.statEffects = (interaction.statEffects ?? []).filter(
      ({ statId }) => !assignmentIds.has(statId),
    );
    for (const trigger of interaction.triggers) {
      trigger.conditions = trigger.conditions.filter(
        (condition) => !('statId' in condition) || !assignmentIds.has(condition.statId),
      );
    }
  }
}
