import type { Interaction, ReaderProgressState, Story } from '../model/index.js';
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

export function getInitialStatValues(story: Story): Record<string, number> {
  return Object.fromEntries(
    (story.characters ?? []).flatMap((character) =>
      (character.stats ?? []).map((stat) => [stat.id, stat.initialValue]),
    ),
  );
}

export function applyInteractionStatEffects(
  values: Readonly<Record<string, number>>,
  interaction: Interaction,
): Record<string, number> {
  const next = { ...values };
  for (const effect of interaction.statEffects ?? []) {
    next[effect.statId] =
      effect.operation === 'set' ? effect.value : (next[effect.statId] ?? 0) + effect.value;
  }
  return next;
}

export function applyInteractionTimeStatChanges(
  story: Story,
  values: Readonly<Record<string, number>>,
  interaction: Interaction,
): Record<string, number> {
  if (!interaction.durationMinutes) return { ...values };
  const ratesByDefinition = new Map(
    (story.statDefinitions ?? []).map((definition) => [
      definition.id,
      definition.changePerHour ?? 0,
    ]),
  );
  const next = { ...values };
  for (const character of story.characters ?? []) {
    for (const stat of character.stats ?? []) {
      const changePerHour = ratesByDefinition.get(stat.statDefinitionId) ?? 0;
      if (changePerHour !== 0) {
        next[stat.id] =
          (next[stat.id] ?? stat.initialValue) + (changePerHour * interaction.durationMinutes) / 60;
      }
    }
  }
  return next;
}

export function applyInteractionStatChanges(
  story: Story,
  values: Readonly<Record<string, number>>,
  interaction: Interaction,
): Record<string, number> {
  return applyInteractionStatEffects(
    applyInteractionTimeStatChanges(story, values, interaction),
    interaction,
  );
}

export function getJourneyStatValues(story: Story, journey: string[]): Record<string, number> {
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

export function getInitialItemStatValues(story: Story): Record<string, Record<string, number>> {
  const definitions = new Map(
    (story.itemDefinitions ?? []).map((definition) => [definition.id, definition]),
  );
  return Object.fromEntries(
    getStructurallyPlacedItemInstances(story).map(({ item }) => [
      item.id,
      Object.fromEntries(
        (definitions.get(item.itemDefinitionId)?.stats ?? []).map((stat) => [
          stat.statDefinitionId,
          stat.initialValue,
        ]),
      ),
    ]),
  );
}

export function applyInteractionItemStatChanges(
  story: Story,
  values: Readonly<Record<string, Readonly<Record<string, number>>>>,
  interaction: Interaction,
  ownedItemIds: readonly string[] = [],
): Record<string, Record<string, number>> {
  const next = Object.fromEntries(
    Object.entries(values).map(([itemId, stats]) => [itemId, { ...stats }]),
  );
  const definitions = new Map(
    (story.itemDefinitions ?? []).map((definition) => [definition.id, definition]),
  );
  const rates = new Map(
    (story.statDefinitions ?? []).map((definition) => [
      definition.id,
      definition.changePerHour ?? 0,
    ]),
  );
  for (const itemId of ownedItemIds) {
    const itemDefinitionId = getItemDefinitionIdForInstance(story, itemId);
    const definition = definitions.get(itemDefinitionId ?? '');
    next[itemId] ??= Object.fromEntries(
      (definition?.stats ?? []).map((stat) => [stat.statDefinitionId, stat.initialValue]),
    );
  }
  if (interaction.durationMinutes) {
    for (const [itemId, itemValues] of Object.entries(next)) {
      const itemDefinitionId = getItemDefinitionIdForInstance(story, itemId);
      for (const stat of definitions.get(itemDefinitionId ?? '')?.stats ?? []) {
        const rate = rates.get(stat.statDefinitionId) ?? 0;
        if (rate !== 0) {
          itemValues[stat.statDefinitionId] =
            (itemValues[stat.statDefinitionId] ?? stat.initialValue) +
            (rate * interaction.durationMinutes) / 60;
        }
      }
    }
  }
  for (const effect of interaction.itemStatEffects ?? []) {
    next[effect.itemId] ??= {};
    next[effect.itemId][effect.statDefinitionId] =
      effect.operation === 'set'
        ? effect.value
        : (next[effect.itemId][effect.statDefinitionId] ?? 0) + effect.value;
  }
  return next;
}

export function getJourneyItemStatValues(
  story: Story,
  journey: string[],
): Record<string, Record<string, number>> {
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
    version: 1,
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
