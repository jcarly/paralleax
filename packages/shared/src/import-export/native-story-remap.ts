import { remapExpressionReferences } from '../expressions/remap.js';
import type {
  Character,
  Interaction,
  ItemDefinition,
  ItemInstance,
  Location,
  StatAssignment,
  Trigger,
} from '../model/index.js';
import type { TriggerCondition } from '../triggers/conditions.js';
import type { NativeStoryContent } from './native-story.js';

export type NativeStoryIdKind =
  | 'interaction'
  | 'trigger'
  | 'character'
  | 'location'
  | 'statDefinition'
  | 'statAssignment'
  | 'itemDefinition'
  | 'itemInstance'
  | 'group'
  | 'graphDecoration';
export type NativeStoryIdMaps = Partial<Record<NativeStoryIdKind, ReadonlyMap<string, string>>>;
export type RemapNativeStoryBody = (body: string, maps: NativeStoryIdMaps) => string;

/** Remap already-validated content with a caller-supplied, collision-free mapping. */
export function remapNativeStoryContent(
  source: NativeStoryContent,
  maps: NativeStoryIdMaps,
  remapBody: RemapNativeStoryBody,
): NativeStoryContent {
  const story = structuredClone(source);
  remapContext(story, maps);
  remapOrganization(story, maps);
  for (const interaction of story.interactions) {
    remapInteraction(interaction, maps, remapBody);
  }
  return story;
}

function remapContext(story: NativeStoryContent, maps: NativeStoryIdMaps): void {
  for (const definition of story.statDefinitions ?? []) {
    definition.id = mapId(maps, 'statDefinition', definition.id);
  }
  for (const definition of story.itemDefinitions ?? []) {
    remapItemDefinition(definition, maps);
  }
  remapAssignments(story.stats, maps);
  for (const character of story.characters ?? []) {
    remapOwner(character, maps, 'character');
  }
  for (const location of story.locations ?? []) {
    remapOwner(location, maps, 'location');
  }
}

function remapOrganization(story: NativeStoryContent, maps: NativeStoryIdMaps): void {
  for (const group of story.groups ?? []) {
    group.id = mapId(maps, 'group', group.id);
    group.parentGroupId = optionalId(maps, 'group', group.parentGroupId);
    group.interactionIds = group.interactionIds.map((id) => mapId(maps, 'interaction', id));
  }
  for (const decoration of story.graphDecorations ?? []) {
    decoration.id = mapId(maps, 'graphDecoration', decoration.id);
  }
}

function mapId(maps: NativeStoryIdMaps, kind: NativeStoryIdKind, id: string): string {
  return maps[kind]?.get(id) ?? id;
}

function optionalId(
  maps: NativeStoryIdMaps,
  kind: NativeStoryIdKind,
  id: string | undefined,
): string | undefined {
  return id === undefined ? undefined : mapId(maps, kind, id);
}

function remapAssignments(
  assignments: StatAssignment[] | undefined,
  maps: NativeStoryIdMaps,
): void {
  for (const assignment of assignments ?? []) {
    assignment.id = mapId(maps, 'statAssignment', assignment.id);
    assignment.statDefinitionId = mapId(maps, 'statDefinition', assignment.statDefinitionId);
  }
}

function remapItemDefinition(definition: ItemDefinition, maps: NativeStoryIdMaps): void {
  definition.id = mapId(maps, 'itemDefinition', definition.id);
  remapAssignments(definition.stats, maps);
}

function remapOwner(
  owner: Character | Location,
  maps: NativeStoryIdMaps,
  kind: 'character' | 'location',
): void {
  owner.id = mapId(maps, kind, owner.id);
  remapAssignments(owner.stats, maps);
  for (const item of owner.items ?? []) {
    remapItem(item, maps);
  }
}

function remapItem(item: ItemInstance, maps: NativeStoryIdMaps): void {
  item.id = mapId(maps, 'itemInstance', item.id);
  item.itemDefinitionId = mapId(maps, 'itemDefinition', item.itemDefinitionId);
  item.parentItemId = optionalId(maps, 'itemInstance', item.parentItemId);
}

function remapInteraction(
  interaction: Interaction,
  maps: NativeStoryIdMaps,
  remapBody: RemapNativeStoryBody,
): void {
  interaction.id = mapId(maps, 'interaction', interaction.id);
  if (interaction.locationId !== undefined && interaction.locationId !== null) {
    interaction.locationId = mapId(maps, 'location', interaction.locationId);
  }
  interaction.characterIds = interaction.characterIds?.map((id) => mapId(maps, 'character', id));
  interaction.body = remapBody(interaction.body, maps);
  remapInteractionEffects(interaction, maps);
  for (const block of interaction.conditionalTextBlocks ?? []) {
    block.conditions = block.conditions.map((condition) => remapCondition(condition, maps));
  }
  for (const trigger of interaction.triggers) {
    remapTrigger(trigger, maps);
  }
}

function remapInteractionEffects(interaction: Interaction, maps: NativeStoryIdMaps): void {
  for (const effect of interaction.statEffects ?? []) {
    effect.statId = mapId(maps, 'statAssignment', effect.statId);
    effect.itemId = optionalId(maps, 'itemInstance', effect.itemId);
    if (effect.expression !== undefined) {
      effect.expression = remapExpression(effect.expression, maps);
    }
  }
  for (const effect of interaction.itemEffects ?? []) {
    effect.itemId = optionalId(maps, 'itemInstance', effect.itemId);
    effect.itemDefinitionId = optionalId(maps, 'itemDefinition', effect.itemDefinitionId);
    effect.characterId = optionalId(maps, 'character', effect.characterId);
  }
}

function remapTrigger(trigger: Trigger, maps: NativeStoryIdMaps): void {
  const previousId = trigger.id;
  trigger.id = mapId(maps, 'trigger', previousId);
  if (trigger.id !== previousId && trigger.probabilityKey === undefined) {
    trigger.probabilityKey = previousId;
  }
  trigger.inputInteractionIds = trigger.inputInteractionIds.map((id) =>
    mapId(maps, 'interaction', id),
  );
  trigger.conditions = trigger.conditions?.map((condition) => remapCondition(condition, maps));
  for (const group of trigger.conditionGroups ?? []) {
    group.conditions = group.conditions.map((condition) => remapCondition(condition, maps));
  }
}

function remapCondition(condition: TriggerCondition, maps: NativeStoryIdMaps): TriggerCondition {
  if ('interactionId' in condition) {
    return { ...condition, interactionId: mapId(maps, 'interaction', condition.interactionId) };
  }
  if ('locationId' in condition) {
    return { ...condition, locationId: mapId(maps, 'location', condition.locationId) };
  }
  if ('characterId' in condition) {
    return { ...condition, characterId: mapId(maps, 'character', condition.characterId) };
  }
  if ('itemDefinitionId' in condition) {
    return {
      ...condition,
      itemDefinitionId: mapId(maps, 'itemDefinition', condition.itemDefinitionId),
    };
  }
  if ('temporal' in condition) {
    return condition;
  }
  const base = {
    statId: mapId(maps, 'statAssignment', condition.statId),
    itemId: optionalId(maps, 'itemInstance', condition.itemId),
    operator: condition.operator,
  };
  if (condition.expression !== undefined) {
    return { ...base, expression: remapExpression(condition.expression, maps) };
  }
  if ('comparisonStatId' in condition) {
    return {
      ...base,
      comparisonStatId: mapId(maps, 'statAssignment', condition.comparisonStatId),
      comparisonItemId: optionalId(maps, 'itemInstance', condition.comparisonItemId),
    };
  }
  return { ...base, value: condition.value };
}

function remapExpression(expression: string, maps: NativeStoryIdMaps): string {
  const result = remapExpressionReferences(expression, {
    assignments: maps.statAssignment ?? new Map(),
    items: maps.itemInstance ?? new Map(),
  });
  if (result === undefined) {
    throw new Error('Cannot remap an invalid expression');
  }
  return result;
}
