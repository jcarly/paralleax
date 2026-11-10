import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  getStoryItemEntries,
  getTriggerAppearanceProbability,
  getTriggerConditionGroups,
  getTriggerTimerSeconds,
  getStatValueType,
  getStatTargets,
  inferExpressionType,
  isStatValueOfType,
  expressionReferencesAny,
  removeStatConditionsReferencing,
  cleanStatConditionalTextReferences,
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

type StatEffectInput = {
  statId: string;
  itemId?: string;
  operation: 'add' | 'set';
  value?: unknown;
  expression?: string;
};

type StatConditionInput = {
  statId: string;
  itemId?: string;
  operator: StatComparisonOperator;
  value?: unknown;
  comparisonStatId?: string;
  comparisonItemId?: string;
  expression?: string;
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
  const definition = statDefinitionFromInput(id, input);
  (story.statDefinitions ??= []).push(definition);
  return definition;
}

function statDefinitionFromInput(id: string, input: StatDefinitionInput): StatDefinition {
  const name = requiredStatName(input.name);
  validateChangePerHour(input.valueType, input.changePerHour);
  return {
    id,
    name,
    valueType: input.valueType,
    ...optionalCategory(input.category),
    ...optionalImageUrl(input.imageUrl),
    ...optionalChangePerHour(input.valueType, input.changePerHour),
  };
}

function requiredStatName(name: string) {
  const normalized = name.trim();
  if (!normalized) {
    throw new BadRequestException('Stat name cannot be blank');
  }
  return normalized;
}

function validateChangePerHour(valueType: StatValueType, changePerHour?: number) {
  if (valueType !== 'number' && changePerHour) {
    throw new BadRequestException('Only numeric stats can change over time');
  }
}

function optionalCategory(category?: string) {
  const normalized = category?.trim();
  return normalized ? { category: normalized } : {};
}

function optionalImageUrl(imageUrl?: string) {
  const normalized = imageUrl?.trim();
  return normalized ? { imageUrl: normalized } : {};
}

function optionalChangePerHour(valueType: StatValueType, changePerHour?: number) {
  return valueType === 'number' && changePerHour ? { changePerHour } : {};
}

export function updateStatDefinition(
  story: Story,
  id: string,
  input: { name?: string; category?: string; imageUrl?: string; changePerHour?: number },
): StatDefinition {
  const definition = findStatDefinition(story, id);
  updateStatName(definition, input.name);
  updateStatCategory(definition, input.category);
  updateStatImageUrl(definition, input.imageUrl);
  updateStatChangePerHour(definition, input.changePerHour);
  return definition;
}

function updateStatName(definition: StatDefinition, name?: string) {
  if (name !== undefined) {
    definition.name = requiredStatName(name);
  }
}

function updateStatCategory(definition: StatDefinition, category?: string) {
  if (category === undefined) {
    return;
  }
  const normalized = category.trim();
  if (normalized) {
    definition.category = normalized;
  } else {
    delete definition.category;
  }
}

function updateStatImageUrl(definition: StatDefinition, imageUrl?: string) {
  if (imageUrl === undefined) {
    return;
  }
  const normalized = imageUrl.trim();
  if (normalized) {
    definition.imageUrl = normalized;
  } else {
    delete definition.imageUrl;
  }
}

function updateStatChangePerHour(definition: StatDefinition, changePerHour?: number) {
  if (changePerHour === undefined) {
    return;
  }
  if (getStatValueType(definition) !== 'number' && changePerHour !== 0) {
    throw new BadRequestException('Only numeric stats can change over time');
  }
  if (changePerHour) {
    definition.changePerHour = changePerHour;
  } else {
    delete definition.changePerHour;
  }
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

export function validateStatEffects(story: Story, effects: StatEffectInput[]): StatEffect[] {
  const targets = new Set<string>();
  return effects.map((effect) => validateStatEffect(story, effect, targets));
}

function validateStatEffect(story: Story, effect: StatEffectInput, targets: Set<string>) {
  if ((effect.value !== undefined) === (effect.expression !== undefined)) {
    throw new BadRequestException('A stat effect requires one literal value or expression');
  }
  const reference = validateStatAssignmentReference(story, effect.statId);
  assertItemTarget(story, reference, effect.itemId);
  const definition = findStatDefinition(story, reference.assignment.statDefinitionId);
  if (effect.expression !== undefined) {
    return validateExpressionStatEffect({ story, effect, reference, definition, targets });
  }
  return validateLiteralStatEffect({ effect, reference, definition, targets });
}

function validateExpressionStatEffect({
  story,
  effect,
  reference,
  definition,
  targets,
}: {
  story: Story;
  effect: StatEffectInput;
  reference: StatAssignmentReference;
  definition: StatDefinition;
  targets: Set<string>;
}) {
  const expression = effect.expression;
  if (expression === undefined) {
    throw new BadRequestException('A stat effect requires one literal value or expression');
  }
  const expressionType = validateExpression(story, expression);
  const targetType = getStatValueType(definition);
  if (expressionType !== targetType) {
    throw new BadRequestException(`Stat expression must evaluate to a ${targetType}`);
  }
  assertAddEffectType(effect.operation, targetType);
  assertUniqueEffectTarget(targets, effect.itemId, reference.assignment.id);
  return {
    statId: reference.assignment.id,
    ...(effect.itemId ? { itemId: effect.itemId } : {}),
    operation: effect.operation,
    expression,
  };
}

function validateLiteralStatEffect({
  effect,
  reference,
  definition,
  targets,
}: {
  effect: StatEffectInput;
  reference: StatAssignmentReference;
  definition: StatDefinition;
  targets: Set<string>;
}) {
  const value = assertStatValue(effect.value, definition);
  assertAddEffectType(effect.operation, getStatValueType(definition));
  assertUniqueEffectTarget(targets, effect.itemId, reference.assignment.id);
  return {
    statId: reference.assignment.id,
    ...(effect.itemId ? { itemId: effect.itemId } : {}),
    operation: effect.operation,
    value,
  };
}

function assertAddEffectType(operation: 'add' | 'set', valueType: StatValueType) {
  if (operation === 'add' && valueType !== 'number') {
    throw new BadRequestException('Only numeric stats support add effects');
  }
}

function assertUniqueEffectTarget(
  targets: Set<string>,
  itemId: string | undefined,
  statId: string,
) {
  const target = `${itemId ?? ''}:${statId}`;
  if (targets.has(target)) {
    throw new BadRequestException('An interaction can affect each stat target at most once');
  }
  targets.add(target);
}

type StatConditionContext = {
  story: Story;
  input: StatConditionInput;
  reference: StatAssignmentReference;
  definition: StatDefinition;
};

export function buildStatCondition(story: Story, input: StatConditionInput): StatCondition {
  const reference = validateStatAssignmentReference(story, input.statId);
  assertItemTarget(story, reference, input.itemId);
  const definition = findStatDefinition(story, reference.assignment.statDefinitionId);
  assertStatConditionInput(input);
  const context = { story, input, reference, definition };
  if (input.expression !== undefined) {
    return buildExpressionStatCondition(context, input.expression);
  }
  if (input.comparisonStatId !== undefined) {
    return buildTargetStatCondition(context, input.comparisonStatId);
  }
  return buildLiteralStatCondition(context);
}

function assertStatConditionInput(input: StatConditionInput) {
  const hasOneComparison =
    [
      input.value !== undefined,
      input.comparisonStatId !== undefined,
      input.expression !== undefined,
    ].filter(Boolean).length === 1;
  if (!hasOneComparison) {
    throw new BadRequestException(
      'A stat condition must compare with one literal value, stat target, or expression',
    );
  }
  if (input.comparisonItemId !== undefined && input.comparisonStatId === undefined) {
    throw new BadRequestException('A comparison item requires a comparison stat target');
  }
}

function buildExpressionStatCondition(context: StatConditionContext, expression: string) {
  const { story, input, reference, definition } = context;
  const expressionType = validateExpression(story, expression);
  const targetType = getStatValueType(definition);
  if (expressionType !== targetType) {
    throw new BadRequestException(`Stat comparison expression must evaluate to a ${targetType}`);
  }
  assertStatComparisonOperator(input.operator, targetType);
  return {
    statId: reference.assignment.id,
    ...(input.itemId ? { itemId: input.itemId } : {}),
    operator: input.operator,
    expression,
  };
}

function buildTargetStatCondition(context: StatConditionContext, comparisonStatId: string) {
  const { story, input, reference, definition } = context;
  const targetType = getStatValueType(definition);
  assertStatComparisonOperator(input.operator, targetType);
  const comparisonReference = validateStatAssignmentReference(story, comparisonStatId);
  assertItemTarget(story, comparisonReference, input.comparisonItemId);
  const comparisonDefinition = findStatDefinition(
    story,
    comparisonReference.assignment.statDefinitionId,
  );
  if (getStatValueType(comparisonDefinition) !== targetType) {
    throw new BadRequestException('Compared stats must have the same value type');
  }
  return {
    statId: reference.assignment.id,
    ...(input.itemId ? { itemId: input.itemId } : {}),
    operator: input.operator,
    comparisonStatId: comparisonReference.assignment.id,
    ...(input.comparisonItemId ? { comparisonItemId: input.comparisonItemId } : {}),
  };
}

function buildLiteralStatCondition(context: StatConditionContext) {
  const { input, reference, definition } = context;
  assertStatComparisonOperator(input.operator, getStatValueType(definition));
  const value = assertStatValue(input.value, definition);
  return {
    statId: reference.assignment.id,
    ...(input.itemId ? { itemId: input.itemId } : {}),
    operator: input.operator,
    value,
  };
}

function assertStatComparisonOperator(operator: StatComparisonOperator, valueType: StatValueType) {
  if (valueType !== 'number' && !['eq', 'neq'].includes(operator)) {
    throw new BadRequestException('Boolean and string stats only support equality checks');
  }
}

export function findStatDefinition(story: Story, id: string): StatDefinition {
  const definition = (story.statDefinitions ?? []).find((candidate) => candidate.id === id);
  if (!definition) {
    throw new NotFoundException('Stat definition not found');
  }
  return definition;
}

export function findStatAssignment(story: Story, id: string): StatAssignmentReference {
  const reference = getStatAssignments(story).find(({ assignment }) => assignment.id === id);
  if (!reference) {
    throw new NotFoundException('Stat assignment not found');
  }
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
    if (ownerId !== undefined) {
      throw new BadRequestException('Story stats do not use an owner id');
    }
    return (story.stats ??= []);
  }
  if (!ownerId) {
    throw new BadRequestException('Stat owner id is required');
  }
  switch (ownerType) {
    case 'character':
      return ownerStatAssignments(story.characters, ownerId);
    case 'location':
      return ownerStatAssignments(story.locations, ownerId);
    case 'itemDefinition':
      return ownerStatAssignments(story.itemDefinitions, ownerId);
  }
}

function ownerStatAssignments<TOwner extends { id: string; stats?: StatAssignment[] }>(
  owners: TOwner[] | undefined,
  ownerId: string,
) {
  const owner = (owners ?? []).find(({ id }) => id === ownerId);
  if (!owner) {
    throw new BadRequestException('Stat owner must belong to the same story');
  }
  return (owner.stats ??= []);
}

function assertItemTarget(story: Story, reference: StatAssignmentReference, itemId?: string) {
  if (reference.ownerType !== 'itemDefinition') {
    if (itemId) {
      throw new BadRequestException('Only item stats can target an item instance');
    }
    return;
  }
  if (!itemId) {
    throw new BadRequestException('Item stats require an exact item instance');
  }
  const item = getStoryItemEntries(story).find(
    ({ item: candidate }) => candidate.id === itemId,
  )?.item;
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
  removeAssignmentsFromOwners(story.characters, assignmentIds);
  removeAssignmentsFromOwners(story.locations, assignmentIds);
  removeAssignmentsFromOwners(story.itemDefinitions, assignmentIds);
  for (const interaction of story.interactions) {
    removeStatReferencesFromInteraction(interaction, assignmentIds);
  }
}

function removeAssignmentsFromOwners<TOwner extends { stats?: StatAssignment[] }>(
  owners: TOwner[] | undefined,
  assignmentIds: ReadonlySet<string>,
) {
  for (const owner of owners ?? []) {
    owner.stats = (owner.stats ?? []).filter(({ id }) => !assignmentIds.has(id));
  }
}

function removeStatReferencesFromInteraction(
  interaction: Story['interactions'][number],
  assignmentIds: ReadonlySet<string>,
) {
  Object.assign(interaction, cleanStatConditionalTextReferences(interaction, assignmentIds));
  interaction.statEffects = (interaction.statEffects ?? []).filter(
    ({ statId, expression }) =>
      !assignmentIds.has(statId) && !expressionReferencesAny(expression, assignmentIds),
  );
  for (const trigger of interaction.triggers) {
    removeStatReferencesFromTrigger(trigger, assignmentIds);
  }
}

function removeStatReferencesFromTrigger(
  trigger: Story['interactions'][number]['triggers'][number],
  assignmentIds: ReadonlySet<string>,
) {
  trigger.conditionGroups = getTriggerConditionGroups(trigger).map((group) => ({
    ...group,
    conditions: removeStatConditionsReferencing(group.conditions, assignmentIds),
  }));
  trigger.appearanceProbability = getTriggerAppearanceProbability(trigger);
  trigger.timerSeconds = getTriggerTimerSeconds(trigger);
  delete trigger.conditions;
}

function validateExpression(story: Story, expression: string): StatValueType {
  const targets = getStatTargets(story);
  const type = inferExpressionType(expression, ({ id, itemId }) => {
    const target = targets.find(
      (candidate) => candidate.assignment.id === id && candidate.itemId === itemId,
    );
    return target?.definition ? getStatValueType(target.definition) : undefined;
  });
  if (!type) {
    throw new BadRequestException(
      'Invalid stat expression or expression reference outside the story',
    );
  }
  return type;
}
