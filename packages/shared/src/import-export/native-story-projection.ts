import type {
  Character,
  ConditionalTextBlock,
  GraphDecoration,
  Group,
  Interaction,
  ItemDefinition,
  ItemEffect,
  ItemInstance,
  Location,
  Position,
  StatAssignment,
  StatDefinition,
  StatEffect,
  Story,
  Trigger,
  TriggerConditionGroup,
} from '../model/index.js';
import type { StatCondition, TriggerCondition } from '../triggers/conditions.js';
import { NATIVE_STORY_FORMAT, NATIVE_STORY_VERSION, type NativeStoryFile } from './native-story.js';

/** Project authored data explicitly, preserving collection order and entity identifiers. */
export function projectNativeStory(story: Story): NativeStoryFile {
  return {
    format: NATIVE_STORY_FORMAT,
    version: NATIVE_STORY_VERSION,
    story: {
      title: story.title,
      startDateTime: story.startDateTime,
      locations: story.locations?.map(projectLocation),
      characters: story.characters?.map(projectCharacter),
      stats: story.stats?.map(projectAssignment),
      statDefinitions: story.statDefinitions?.map(projectStatDefinition),
      itemDefinitions: story.itemDefinitions?.map(projectItemDefinition),
      groups: story.groups?.map(projectGroup),
      graphDecorations: story.graphDecorations?.map(projectDecoration),
      interactions: story.interactions.map(projectInteraction),
    },
  };
}

function projectPosition(position: Position): Position {
  return { x: position.x, y: position.y };
}

function projectAssignment(assignment: StatAssignment): StatAssignment {
  return {
    id: assignment.id,
    statDefinitionId: assignment.statDefinitionId,
    initialValue: assignment.initialValue,
  };
}

function projectStatDefinition(definition: StatDefinition): StatDefinition {
  return {
    id: definition.id,
    name: definition.name,
    valueType: definition.valueType,
    category: definition.category,
    imageUrl: definition.imageUrl,
    changePerHour: definition.changePerHour,
  };
}

function projectItem(item: ItemInstance): ItemInstance {
  return {
    id: item.id,
    itemDefinitionId: item.itemDefinitionId,
    parentItemId: item.parentItemId,
    relationshipType: item.relationshipType,
    slotKey: item.slotKey,
  };
}

function projectLocation(location: Location): Location {
  return {
    id: location.id,
    name: location.name,
    description: location.description,
    category: location.category,
    imageUrl: location.imageUrl,
    stats: location.stats?.map(projectAssignment),
    items: location.items?.map(projectItem),
  };
}

function projectCharacter(character: Character): Character {
  return { ...projectLocation(character), isPlayable: character.isPlayable };
}

function projectItemDefinition(definition: ItemDefinition): ItemDefinition {
  return {
    id: definition.id,
    name: definition.name,
    description: definition.description,
    category: definition.category,
    imageUrl: definition.imageUrl,
    stats: definition.stats?.map(projectAssignment),
  };
}

function projectGroup(group: Group): Group {
  return {
    id: group.id,
    title: group.title,
    interactionIds: [...group.interactionIds],
    parentGroupId: group.parentGroupId,
  };
}

function projectDecoration(decoration: GraphDecoration): GraphDecoration {
  const base = {
    id: decoration.id,
    position: projectPosition(decoration.position),
    color: decoration.color,
  };
  if (decoration.kind === 'frame') {
    return { ...base, kind: 'frame', width: decoration.width, height: decoration.height };
  }
  return {
    ...base,
    kind: 'text',
    text: decoration.text,
    fontSize: decoration.fontSize,
    fontFamily: decoration.fontFamily,
    fontWeight: decoration.fontWeight,
    fontStyle: decoration.fontStyle,
  };
}

function projectStatEffect(effect: StatEffect): StatEffect {
  return {
    statId: effect.statId,
    itemId: effect.itemId,
    operation: effect.operation,
    value: effect.value,
    expression: effect.expression,
  };
}

function projectItemEffect(effect: ItemEffect): ItemEffect {
  return {
    itemId: effect.itemId,
    itemDefinitionId: effect.itemDefinitionId,
    characterId: effect.characterId,
    operation: effect.operation,
  };
}

function projectInteraction(interaction: Interaction): Interaction {
  return {
    id: interaction.id,
    title: interaction.title,
    body: interaction.body,
    position: projectPosition(interaction.position),
    locationId: interaction.locationId,
    characterIds: interaction.characterIds?.slice(),
    statEffects: interaction.statEffects?.map(projectStatEffect),
    itemEffects: interaction.itemEffects?.map(projectItemEffect),
    conditionalTextBlocks: interaction.conditionalTextBlocks?.map(projectBlock),
    durationMinutes: interaction.durationMinutes,
    triggers: interaction.triggers.map(projectTrigger),
  };
}

function projectBlock(block: ConditionalTextBlock): ConditionalTextBlock {
  return { id: block.id, conditions: block.conditions.map(projectCondition) };
}

function projectTrigger(trigger: Trigger): Trigger {
  return {
    id: trigger.id,
    probabilityKey: trigger.probabilityKey,
    inputInteractionIds: [...trigger.inputInteractionIds],
    conditions: trigger.conditions?.map(projectCondition),
    conditionGroups: trigger.conditionGroups?.map(projectConditionGroup),
    appearanceProbability: trigger.appearanceProbability,
    timerSeconds: trigger.timerSeconds,
    position: trigger.position && projectPosition(trigger.position),
  };
}

function projectConditionGroup(group: TriggerConditionGroup): TriggerConditionGroup {
  return { id: group.id, conditions: group.conditions.map(projectCondition) };
}

function projectCondition(condition: TriggerCondition): TriggerCondition {
  if ('interactionId' in condition) {
    return { interactionId: condition.interactionId, hasBeenVisited: condition.hasBeenVisited };
  }
  if ('locationId' in condition) {
    return { locationId: condition.locationId, isCurrentLocation: condition.isCurrentLocation };
  }
  if ('characterId' in condition) {
    return { characterId: condition.characterId, isPresent: condition.isPresent };
  }
  if ('itemDefinitionId' in condition) {
    return { itemDefinitionId: condition.itemDefinitionId, isOwned: condition.isOwned };
  }
  if ('temporal' in condition) {
    const temporal = condition.temporal;
    return {
      temporal: {
        dates: temporal.dates?.slice(),
        weekdays: temporal.weekdays?.slice(),
        dateRanges: temporal.dateRanges?.map(({ startDate, endDate }) => ({ startDate, endDate })),
        timeSlots: temporal.timeSlots?.map(({ startTime, endTime }) => ({ startTime, endTime })),
      },
    };
  }
  return projectStatCondition(condition);
}

function projectStatCondition(condition: StatCondition): StatCondition {
  const base = { statId: condition.statId, itemId: condition.itemId, operator: condition.operator };
  if (condition.expression !== undefined) {
    return { ...base, expression: condition.expression };
  }
  if ('comparisonStatId' in condition) {
    return {
      ...base,
      comparisonStatId: condition.comparisonStatId,
      comparisonItemId: condition.comparisonItemId,
    };
  }
  return { ...base, value: condition.value };
}
