import type {
  Interaction,
  ReaderProgressState,
  StatAssignment,
  StatDefinition,
  StatValue,
  Story,
} from '../model/index.js';
import { getStatValueType, isStatValueOfType } from '../model/index.js';
import { getJourneyDateTime } from '../time/index.js';

function getStructurallyPlacedItemInstances(story: Story) {
  return [...(story.characters ?? []), ...(story.locations ?? [])].flatMap((owner) => {
    const items = owner.items ?? [];
    const childrenByParentId = new Map<string, typeof items>();
    for (const item of items) {
      if (!item.parentItemId) continue;
      childrenByParentId.set(item.parentItemId, [
        ...(childrenByParentId.get(item.parentItemId) ?? []),
        item,
      ]);
    }

    const reachableIds = new Set<string>();
    const pending = items.filter((item) => !item.parentItemId);
    while (pending.length > 0) {
      const item = pending.pop();
      if (!item || reachableIds.has(item.id)) continue;
      reachableIds.add(item.id);
      pending.push(...(childrenByParentId.get(item.id) ?? []));
    }

    return items
      .filter((item) => reachableIds.has(item.id))
      .map((item) => ({ ownerId: owner.id, item }));
  });
}

export function getNonItemStatAssignments(story: Story): StatAssignment[] {
  return [
    ...(story.stats ?? []),
    ...(story.characters ?? []).flatMap((character) => character.stats ?? []),
    ...(story.locations ?? []).flatMap((location) => location.stats ?? []),
  ];
}

function getStatDefinitions(story: Story): Map<string, StatDefinition> {
  return new Map((story.statDefinitions ?? []).map((definition) => [definition.id, definition]));
}

export function getItemStatAssignments(story: Story, itemId: string): StatAssignment[] {
  const itemDefinitionId = getItemDefinitionIdForInstance(story, itemId);
  return (
    (story.itemDefinitions ?? []).find((definition) => definition.id === itemDefinitionId)?.stats ??
    []
  );
}

export function getStatDefinitionForAssignment(
  story: Story,
  statId: string,
  itemId?: string,
): StatDefinition | undefined {
  const assignment = itemId
    ? getItemStatAssignments(story, itemId).find(({ id }) => id === statId)
    : getNonItemStatAssignments(story).find(({ id }) => id === statId);
  return getStatDefinitions(story).get(assignment?.statDefinitionId ?? '');
}

function initialValuesForAssignments(
  definitions: ReadonlyMap<string, StatDefinition>,
  assignments: readonly StatAssignment[],
): Record<string, StatValue> {
  return Object.fromEntries(
    assignments.flatMap((assignment) => {
      const definition = definitions.get(assignment.statDefinitionId);
      return definition && isStatValueOfType(assignment.initialValue, getStatValueType(definition))
        ? [[assignment.id, assignment.initialValue]]
        : [];
    }),
  );
}

function applyEffect(
  currentValue: StatValue | undefined,
  operation: 'add' | 'set',
  value: StatValue,
) {
  if (operation === 'set') return value;
  return typeof currentValue === 'number' && typeof value === 'number'
    ? currentValue + value
    : currentValue;
}

export function getInitialStatValues(story: Story): Record<string, StatValue> {
  return initialValuesForAssignments(getStatDefinitions(story), getNonItemStatAssignments(story));
}

export function applyInteractionStatEffects(
  values: Readonly<Record<string, StatValue>>,
  interaction: Interaction,
): Record<string, StatValue> {
  const next = { ...values };
  for (const effect of interaction.statEffects ?? []) {
    if (effect.itemId) continue;
    const changed = applyEffect(next[effect.statId], effect.operation, effect.value);
    if (changed !== undefined) next[effect.statId] = changed;
  }
  return next;
}

export function applyInteractionTimeStatChanges(
  story: Story,
  values: Readonly<Record<string, StatValue>>,
  interaction: Interaction,
): Record<string, StatValue> {
  if (!interaction.durationMinutes) return { ...values };
  const definitions = getStatDefinitions(story);
  const next = { ...values };
  for (const assignment of getNonItemStatAssignments(story)) {
    const definition = definitions.get(assignment.statDefinitionId);
    const currentValue = next[assignment.id];
    if (
      definition &&
      getStatValueType(definition) === 'number' &&
      typeof currentValue === 'number' &&
      definition.changePerHour
    ) {
      next[assignment.id] =
        currentValue + (definition.changePerHour * interaction.durationMinutes) / 60;
    }
  }
  return next;
}

export function applyInteractionStatChanges(
  story: Story,
  values: Readonly<Record<string, StatValue>>,
  interaction: Interaction,
): Record<string, StatValue> {
  return applyInteractionStatEffects(
    applyInteractionTimeStatChanges(story, values, interaction),
    interaction,
  );
}

export function getJourneyStatValues(story: Story, journey: string[]): Record<string, StatValue> {
  return journey.reduce((values, interactionId) => {
    const interaction = story.interactions.find(({ id }) => id === interactionId);
    return interaction ? applyInteractionStatChanges(story, values, interaction) : values;
  }, getInitialStatValues(story));
}

export function applyInteractionItemEffects(
  story: Story,
  ownedItemIds: readonly string[],
  interaction: Interaction,
  journeyIndex = 0,
): string[] {
  const next = [...ownedItemIds];
  for (const [effectIndex, effect] of (interaction.itemEffects ?? []).entries()) {
    if (effect.itemDefinitionId) {
      if (effect.operation === 'obtain') {
        next.push(
          `runtime-item:${journeyIndex}:${effectIndex}:${encodeURIComponent(
            effect.characterId ?? '',
          )}:${encodeURIComponent(effect.itemDefinitionId)}`,
        );
      } else {
        const index = next.findIndex(
          (itemId) =>
            getItemDefinitionIdForInstance(story, itemId) === effect.itemDefinitionId &&
            (!effect.characterId ||
              getItemOwnerIdForInstance(story, itemId) === effect.characterId),
        );
        if (index !== -1) next.splice(index, 1);
      }
      continue;
    }
    if (!effect.itemId) continue;
    const index = next.indexOf(effect.itemId);
    if (effect.operation === 'obtain' && index === -1) next.push(effect.itemId);
    if (effect.operation === 'lose' && index !== -1) next.splice(index, 1);
  }
  return next;
}

export function getJourneyOwnedItemIds(story: Story, journey: string[]): string[] {
  return journey.reduce((ownedItemIds, interactionId, journeyIndex) => {
    const interaction = story.interactions.find(({ id }) => id === interactionId);
    return interaction
      ? applyInteractionItemEffects(story, ownedItemIds, interaction, journeyIndex)
      : ownedItemIds;
  }, [] as string[]);
}

export function getItemDefinitionIdForInstance(story: Story, itemId: string): string | undefined {
  const authored = getStructurallyPlacedItemInstances(story).find(({ item }) => item.id === itemId);
  if (authored) return authored.item.itemDefinitionId;
  const ownedRuntimeMatch = /^runtime-item:\d+:\d+:[^:]*:(.+)$/.exec(itemId);
  if (ownedRuntimeMatch) return decodeURIComponent(ownedRuntimeMatch[1]);
  const legacyRuntimeMatch = /^runtime-item:\d+:\d+:(.+)$/.exec(itemId);
  return legacyRuntimeMatch ? decodeURIComponent(legacyRuntimeMatch[1]) : undefined;
}

export function getItemOwnerIdForInstance(story: Story, itemId: string): string | undefined {
  const authored = getStructurallyPlacedItemInstances(story).find(({ item }) => item.id === itemId);
  if (authored) return authored.ownerId;
  const match = /^runtime-item:\d+:\d+:([^:]*):/.exec(itemId);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

export function getJourneyOwnedItemDefinitionIds(story: Story, journey: string[]): string[] {
  return getJourneyOwnedItemIds(story, journey).flatMap((itemId) => {
    const definitionId = getItemDefinitionIdForInstance(story, itemId);
    return definitionId ? [definitionId] : [];
  });
}

function cloneItemStatValues(
  values: Readonly<Record<string, Readonly<Record<string, StatValue>>>>,
): Record<string, Record<string, StatValue>> {
  return Object.fromEntries(
    Object.entries(values).map(([itemId, stats]) => [itemId, { ...stats }]),
  );
}

export function getInitialItemStatValues(story: Story): Record<string, Record<string, StatValue>> {
  const definitions = getStatDefinitions(story);
  return Object.fromEntries(
    getStructurallyPlacedItemInstances(story).map(({ item }) => [
      item.id,
      initialValuesForAssignments(definitions, getItemStatAssignments(story, item.id)),
    ]),
  );
}

export function applyInteractionItemStatChanges(
  story: Story,
  values: Readonly<Record<string, Readonly<Record<string, StatValue>>>>,
  interaction: Interaction,
  ownedItemIds: readonly string[] = [],
): Record<string, Record<string, StatValue>> {
  const next = cloneItemStatValues(values);
  const definitions = getStatDefinitions(story);

  for (const itemId of ownedItemIds) {
    next[itemId] ??= initialValuesForAssignments(
      definitions,
      getItemStatAssignments(story, itemId),
    );
  }

  if (interaction.durationMinutes) {
    for (const [itemId, itemValues] of Object.entries(next)) {
      for (const assignment of getItemStatAssignments(story, itemId)) {
        const definition = definitions.get(assignment.statDefinitionId);
        const currentValue = itemValues[assignment.id];
        if (
          definition &&
          getStatValueType(definition) === 'number' &&
          typeof currentValue === 'number' &&
          definition.changePerHour
        ) {
          itemValues[assignment.id] =
            currentValue + (definition.changePerHour * interaction.durationMinutes) / 60;
        }
      }
    }
  }

  for (const effect of interaction.statEffects ?? []) {
    if (!effect.itemId) continue;
    next[effect.itemId] ??= initialValuesForAssignments(
      definitions,
      getItemStatAssignments(story, effect.itemId),
    );
    const changed = applyEffect(next[effect.itemId][effect.statId], effect.operation, effect.value);
    if (changed !== undefined) next[effect.itemId][effect.statId] = changed;
  }
  return next;
}

export function getJourneyItemStatValues(
  story: Story,
  journey: string[],
): Record<string, Record<string, StatValue>> {
  return journey.reduce(
    (state, interactionId, journeyIndex) => {
      const interaction = story.interactions.find(({ id }) => id === interactionId);
      if (!interaction) return state;
      const ownedItemIds = applyInteractionItemEffects(
        story,
        state.ownedItemIds,
        interaction,
        journeyIndex,
      );
      return {
        ownedItemIds,
        values: applyInteractionItemStatChanges(story, state.values, interaction, ownedItemIds),
      };
    },
    { ownedItemIds: [] as string[], values: getInitialItemStatValues(story) },
  ).values;
}

export function getJourneyLocation(story: Story, journey: string[]): string | null {
  for (let index = journey.length - 1; index >= 0; index -= 1) {
    const interaction = story.interactions.find(({ id }) => id === journey[index]);
    if (interaction?.locationId) return interaction.locationId;
  }
  return null;
}

export function buildReaderProgressState(
  story: Story,
  journeyInteractionIds: string[],
  _ownedItemIds: string[] = [],
): ReaderProgressState {
  const interactionIds = new Set(story.interactions.map(({ id }) => id));
  const journey = journeyInteractionIds.filter((id) => interactionIds.has(id));
  const items = getJourneyOwnedItemIds(story, journey);
  return {
    version: 2,
    journeyInteractionIds: journey,
    currentInteractionId: journey.at(-1) ?? null,
    visitedInteractionIds: [...new Set(journey)],
    currentDateTime: getJourneyDateTime(story, journey),
    currentLocationId: getJourneyLocation(story, journey),
    statValues: getJourneyStatValues(story, journey),
    ownedItemIds: items,
    itemStatValues: getJourneyItemStatValues(story, journey),
  };
}
