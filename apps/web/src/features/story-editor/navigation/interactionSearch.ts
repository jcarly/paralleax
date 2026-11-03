import {
  getStoryItemEntries,
  getTriggerConditions,
  type Interaction,
  type Story,
  type TriggerCondition,
} from '@paralleax/shared';

export type InteractionSearchIndex = ReadonlyMap<string, readonly string[]>;

interface SearchReferences {
  interactions: ReadonlyMap<string, Interaction>;
  locations: ReadonlyMap<string, string>;
  characters: ReadonlyMap<string, string>;
  itemDefinitions: ReadonlyMap<string, string>;
  itemDefinitionIdsByItemId: ReadonlyMap<string, string>;
  statAssignmentNames: ReadonlyMap<string, string>;
  statDefinitions: ReadonlyMap<string, string>;
}

/** Build normalized search fields once per authored Story projection. */
export function createInteractionSearchIndex(story: Story | undefined): InteractionSearchIndex {
  if (!story) {
    return new Map();
  }
  const references = buildSearchReferences(story);
  return new Map(
    story.interactions.map((interaction) => [
      interaction.id,
      collectInteractionFields(interaction, references).map(normalizeSearchText).filter(Boolean),
    ]),
  );
}

function buildSearchReferences(story: Story): SearchReferences {
  const statDefinitions = new Map((story.statDefinitions ?? []).map(({ id, name }) => [id, name]));
  const statAssignmentNames = new Map(
    [
      ...(story.stats ?? []),
      ...(story.characters ?? []).flatMap(({ stats }) => stats ?? []),
      ...(story.locations ?? []).flatMap(({ stats }) => stats ?? []),
      ...(story.itemDefinitions ?? []).flatMap(({ stats }) => stats ?? []),
    ].map((assignment) => [assignment.id, statDefinitions.get(assignment.statDefinitionId) ?? '']),
  );
  return {
    interactions: new Map(story.interactions.map((interaction) => [interaction.id, interaction])),
    locations: new Map((story.locations ?? []).map(({ id, name }) => [id, name])),
    characters: new Map((story.characters ?? []).map(({ id, name }) => [id, name])),
    itemDefinitions: new Map((story.itemDefinitions ?? []).map(({ id, name }) => [id, name])),
    itemDefinitionIdsByItemId: new Map(
      getStoryItemEntries(story).map(({ item }) => [item.id, item.itemDefinitionId]),
    ),
    statAssignmentNames,
    statDefinitions,
  };
}

/** Return matching ids in authored Interaction order. */
export function searchInteractionIds(index: InteractionSearchIndex, query: string): string[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) {
    return [];
  }
  return [...index].flatMap(([interactionId, fields]) =>
    fields.some((field) => field.includes(normalizedQuery)) ? [interactionId] : [],
  );
}

function collectInteractionFields(interaction: Interaction, references: SearchReferences) {
  const fields = [interaction.title, interaction.body.replace(/<[^>]*>/g, ' ')];
  addContextFields(fields, interaction, references);
  addEffectFields(fields, interaction, references);
  addIncomingTriggerFields(fields, interaction, references);
  return fields;
}

function addContextFields(
  fields: string[],
  interaction: Interaction,
  references: SearchReferences,
) {
  addOptionalField(fields, getNamedReference(references.locations, interaction.locationId));
  for (const characterId of interaction.characterIds ?? []) {
    addOptionalField(fields, references.characters.get(characterId));
  }
}

function addEffectFields(fields: string[], interaction: Interaction, references: SearchReferences) {
  for (const effect of interaction.statEffects ?? []) {
    addOptionalField(fields, getStatName(references, effect.statId));
    addOptionalField(fields, getItemName(references, effect.itemId));
  }
  for (const effect of interaction.itemEffects ?? []) {
    addOptionalField(
      fields,
      getNamedReference(references.itemDefinitions, effect.itemDefinitionId),
    );
    addOptionalField(fields, getItemName(references, effect.itemId));
  }
}

function addIncomingTriggerFields(
  fields: string[],
  interaction: Interaction,
  references: SearchReferences,
) {
  for (const trigger of interaction.triggers) {
    for (const inputId of trigger.inputInteractionIds) {
      addOptionalField(fields, references.interactions.get(inputId)?.title);
    }
    for (const condition of getTriggerConditions(trigger)) {
      fields.push(...getConditionFields(condition, references));
    }
  }
}

function getConditionFields(condition: TriggerCondition, references: SearchReferences): string[] {
  if ('interactionId' in condition) {
    return optionalFields(references.interactions.get(condition.interactionId)?.title);
  }
  if ('locationId' in condition) {
    return optionalFields(references.locations.get(condition.locationId));
  }
  if ('characterId' in condition) {
    return optionalFields(references.characters.get(condition.characterId));
  }
  if ('itemDefinitionId' in condition) {
    return optionalFields(references.itemDefinitions.get(condition.itemDefinitionId));
  }
  if ('statId' in condition) {
    return getStatConditionFields(condition, references);
  }
  return [JSON.stringify(condition.temporal)];
}

function getStatConditionFields(
  condition: Extract<TriggerCondition, { statId: string }>,
  references: SearchReferences,
) {
  const fields = optionalFields(getStatName(references, condition.statId));
  fields.push(...optionalFields(getItemName(references, condition.itemId)));
  if ('value' in condition && condition.value !== undefined) {
    fields.push(String(condition.value));
  }
  if ('expression' in condition) {
    fields.push(...optionalFields(condition.expression));
  }
  if ('comparisonStatId' in condition) {
    fields.push(...optionalFields(getStatName(references, condition.comparisonStatId)));
  }
  if ('comparisonItemId' in condition) {
    fields.push(...optionalFields(getItemName(references, condition.comparisonItemId)));
  }
  return fields;
}

function getStatName(references: SearchReferences, statId?: string | null) {
  if (!statId) {
    return undefined;
  }
  return references.statAssignmentNames.get(statId) ?? references.statDefinitions.get(statId);
}

function getItemName(references: SearchReferences, itemId?: string | null) {
  const definitionId = itemId ? references.itemDefinitionIdsByItemId.get(itemId) : undefined;
  return definitionId ? references.itemDefinitions.get(definitionId) : undefined;
}

function getNamedReference(references: ReadonlyMap<string, string>, id?: string | null) {
  return id ? references.get(id) : undefined;
}

function optionalFields(value?: string) {
  return value ? [value] : [];
}

function addOptionalField(fields: string[], value?: string) {
  if (value) {
    fields.push(value);
  }
}

function normalizeSearchText(value: string) {
  return value.trim().toLocaleLowerCase();
}
