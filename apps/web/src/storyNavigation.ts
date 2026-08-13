import type { Interaction, Story, TriggerCondition } from '@paralleax/shared';

export type StoryContextReference =
  | { type: 'location'; id: string }
  | { type: 'character'; id: string }
  | { type: 'stat'; id: string }
  | { type: 'item'; id: string };

export function countInteractionTextOccurrences(interaction: Interaction, query: string): number {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return 0;

  const searchableText =
    `${interaction.title} ${interaction.body.replace(/<[^>]*>/g, ' ')}`.toLocaleLowerCase();
  let count = 0;
  let offset = 0;
  while ((offset = searchableText.indexOf(normalizedQuery, offset)) !== -1) {
    count += 1;
    offset += normalizedQuery.length;
  }
  return count;
}

export function getInteractionTextOccurrenceCounts(
  story: Story | undefined,
  query: string,
): Map<string, number> {
  return new Map(
    (story?.interactions ?? []).flatMap((interaction) => {
      const count = countInteractionTextOccurrences(interaction, query);
      return count > 0 ? [[interaction.id, count] as const] : [];
    }),
  );
}

export function getReferencedInteractionIds(
  story: Story | undefined,
  reference: StoryContextReference | undefined,
): string[] {
  if (!story || !reference) return [];

  const characterStatIds = new Set(
    (story.characters ?? []).flatMap((character) => {
      if (reference.type === 'character' && character.id === reference.id) {
        return (character.stats ?? []).map((stat) => stat.id);
      }
      return reference.type === 'stat'
        ? (character.stats ?? [])
            .filter((stat) => stat.statDefinitionId === reference.id)
            .map((stat) => stat.id)
        : [];
    }),
  );
  const itemIds = new Set(
    [...(story.characters ?? []), ...(story.locations ?? [])].flatMap((owner) =>
      (owner.items ?? [])
        .filter((item) => reference.type === 'item' && item.itemDefinitionId === reference.id)
        .map((item) => item.id),
    ),
  );
  const characterItemIds = new Set(
    (story.characters ?? [])
      .filter((character) => reference.type === 'character' && character.id === reference.id)
      .flatMap((character) => (character.items ?? []).map((item) => item.id)),
  );
  const locationItemIds = new Set(
    (story.locations ?? [])
      .filter((location) => reference.type === 'location' && location.id === reference.id)
      .flatMap((location) => (location.items ?? []).map((item) => item.id)),
  );

  return story.interactions
    .filter((interaction) => {
      const conditions = interaction.triggers.flatMap((trigger) => trigger.conditions);
      if (reference.type === 'location') {
        return (
          interaction.locationId === reference.id ||
          (interaction.itemEffects ?? []).some((effect) =>
            effect.itemId ? locationItemIds.has(effect.itemId) : false,
          ) ||
          (interaction.itemStatEffects ?? []).some((effect) =>
            locationItemIds.has(effect.itemId),
          ) ||
          conditions.some(
            (condition) => 'locationId' in condition && condition.locationId === reference.id,
          )
        );
      }
      if (reference.type === 'character') {
        return (
          (interaction.characterIds ?? []).includes(reference.id) ||
          (interaction.statEffects ?? []).some((effect) => characterStatIds.has(effect.statId)) ||
          (interaction.itemEffects ?? []).some(
            (effect) =>
              effect.characterId === reference.id ||
              (effect.itemId ? characterItemIds.has(effect.itemId) : false),
          ) ||
          (interaction.itemStatEffects ?? []).some((effect) =>
            characterItemIds.has(effect.itemId),
          ) ||
          conditions.some(
            (condition) =>
              ('characterId' in condition && condition.characterId === reference.id) ||
              ('statId' in condition && characterStatIds.has(condition.statId)),
          )
        );
      }
      if (reference.type === 'stat') {
        return (
          (interaction.statEffects ?? []).some((effect) => characterStatIds.has(effect.statId)) ||
          (interaction.itemStatEffects ?? []).some(
            (effect) => effect.statDefinitionId === reference.id,
          ) ||
          conditions.some(
            (condition) => 'statId' in condition && characterStatIds.has(condition.statId),
          )
        );
      }
      return (
        (interaction.itemEffects ?? []).some(
          (effect) =>
            effect.itemDefinitionId === reference.id ||
            (effect.itemId ? itemIds.has(effect.itemId) : false),
        ) ||
        (interaction.itemStatEffects ?? []).some((effect) => itemIds.has(effect.itemId)) ||
        conditions.some((condition) => isItemConditionFor(condition, reference.id))
      );
    })
    .map((interaction) => interaction.id);
}

function isItemConditionFor(condition: TriggerCondition, itemDefinitionId: string): boolean {
  return 'itemDefinitionId' in condition && condition.itemDefinitionId === itemDefinitionId;
}
