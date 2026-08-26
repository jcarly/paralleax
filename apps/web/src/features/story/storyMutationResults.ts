import type {
  CharacterItemMutationResult,
  CharacterMutationResult,
  CharacterStatMutationResult,
  GraphDecorationMutationResult,
  Interaction,
  InteractionMutationResult,
  ItemDefinitionMutationResult,
  LocationMutationResult,
  StatDefinitionMutationResult,
  Story,
  Trigger,
  TriggerMutationResult,
} from '@paralleax/shared';

export type LocationPatch = Partial<
  Pick<LocationMutationResult['location'], 'name' | 'description' | 'category' | 'imageUrl'>
>;

export type CharacterPatch = Partial<
  Pick<
    CharacterMutationResult['character'],
    'name' | 'description' | 'category' | 'imageUrl' | 'isPlayable'
  >
>;

export type CharacterStatPatch = Partial<Pick<CharacterStatMutationResult['stat'], 'initialValue'>>;

export type StatDefinitionPatch = Partial<StatDefinitionMutationResult['statDefinition']>;

export type ItemDefinitionPatch = Partial<
  Pick<
    ItemDefinitionMutationResult['itemDefinition'],
    'name' | 'description' | 'category' | 'imageUrl' | 'stats'
  >
>;

export function applyStoryMutationMetadata(
  story: Story,
  mutation: { revision: number; updatedAt: string },
): Story {
  return { ...story, revision: mutation.revision, updatedAt: mutation.updatedAt };
}

export function applyGraphDecorationResult(
  story: Story,
  result: GraphDecorationMutationResult,
): Story {
  return applyStoryMutationMetadata(
    {
      ...story,
      graphDecorations: upsertById(story.graphDecorations, result.decoration),
    },
    result,
  );
}

export function applyLocationResult(story: Story, result: LocationMutationResult): Story {
  return applyStoryMutationMetadata(
    {
      ...story,
      locations: upsertById(story.locations, result.location),
    },
    result,
  );
}

export function updateLocalLocation(story: Story, locationId: string, patch: LocationPatch): Story {
  return {
    ...story,
    locations: patchById<LocationMutationResult['location']>(story.locations, locationId, patch),
  };
}

export function applyLocationPatchResult(
  story: Story,
  result: LocationMutationResult,
  locationId: string,
  patch: LocationPatch,
): Story {
  return applyStoryMutationMetadata(updateLocalLocation(story, locationId, patch), result);
}

export function applyCharacterResult(story: Story, result: CharacterMutationResult): Story {
  return applyStoryMutationMetadata(
    {
      ...story,
      characters: upsertById(story.characters, result.character),
    },
    result,
  );
}

export function updateLocalCharacter(
  story: Story,
  characterId: string,
  patch: CharacterPatch,
): Story {
  return {
    ...story,
    characters: (story.characters ?? []).map((character) =>
      character.id === characterId
        ? { ...character, ...patch }
        : patch.isPlayable
          ? { ...character, isPlayable: false }
          : character,
    ),
  };
}

export function applyCharacterPatchResult(
  story: Story,
  result: CharacterMutationResult,
  characterId: string,
  patch: CharacterPatch,
): Story {
  return applyStoryMutationMetadata(updateLocalCharacter(story, characterId, patch), result);
}

export function applyCharacterStatResult(story: Story, result: CharacterStatMutationResult): Story {
  return applyStoryMutationMetadata(
    {
      ...story,
      characters: (story.characters ?? []).map((character) =>
        character.id === result.characterId
          ? { ...character, stats: [...(character.stats ?? []), result.stat] }
          : character,
      ),
    },
    result,
  );
}

export function applyCharacterItemResult(story: Story, result: CharacterItemMutationResult): Story {
  return applyStoryMutationMetadata(
    {
      ...story,
      characters: (story.characters ?? []).map((character) =>
        character.id === result.characterId
          ? { ...character, items: [...(character.items ?? []), result.item] }
          : character,
      ),
    },
    result,
  );
}

export function updateLocalCharacterStat(
  story: Story,
  characterId: string,
  statId: string,
  patch: CharacterStatPatch,
): Story {
  return {
    ...story,
    characters: (story.characters ?? []).map((character) =>
      character.id === characterId
        ? {
            ...character,
            stats: (character.stats ?? []).map((stat) =>
              stat.id === statId ? { ...stat, ...patch } : stat,
            ),
          }
        : character,
    ),
  };
}

export function addLocalStatDefinition(
  story: Story,
  definition: StatDefinitionMutationResult['statDefinition'],
): Story {
  return {
    ...story,
    statDefinitions: [...(story.statDefinitions ?? []), definition],
  };
}

export function updateLocalStatDefinition(
  story: Story,
  statDefinitionId: string,
  patch: StatDefinitionPatch,
): Story {
  return {
    ...story,
    statDefinitions: patchById<StatDefinitionMutationResult['statDefinition']>(
      story.statDefinitions,
      statDefinitionId,
      patch,
    ),
  };
}

export function addLocalItemDefinition(
  story: Story,
  definition: ItemDefinitionMutationResult['itemDefinition'],
): Story {
  return {
    ...story,
    itemDefinitions: [...(story.itemDefinitions ?? []), definition],
  };
}

export function updateLocalItemDefinition(
  story: Story,
  itemDefinitionId: string,
  patch: ItemDefinitionPatch,
): Story {
  return {
    ...story,
    itemDefinitions: patchById<ItemDefinitionMutationResult['itemDefinition']>(
      story.itemDefinitions,
      itemDefinitionId,
      patch,
    ),
  };
}

export function applyInteractionMutationResult(
  story: Story,
  result: InteractionMutationResult,
): Story {
  const interaction = result.interaction;
  return applyStoryMutationMetadata(
    {
      ...story,
      interactions: upsertById(story.interactions, interaction),
    },
    result,
  );
}

export function applyTriggerMutationResult(story: Story, result: TriggerMutationResult): Story {
  return applyStoryMutationMetadata(
    {
      ...story,
      interactions: story.interactions.map((interaction) => {
        if (interaction.id !== result.interactionId) return interaction;
        const exists = interaction.triggers.some(({ id }) => id === result.trigger.id);
        return {
          ...interaction,
          triggers: exists
            ? interaction.triggers.map((trigger) =>
                trigger.id === result.trigger.id ? result.trigger : trigger,
              )
            : [...interaction.triggers, result.trigger],
        };
      }),
    },
    result,
  );
}

export function findSavedInteraction(
  result: InteractionMutationResult | Story,
  current: Story,
  interactionId?: string,
): Interaction | undefined {
  if (!('interactions' in result)) return result.interaction;
  if (interactionId) return result.interactions.find(({ id }) => id === interactionId);
  const currentIds = new Set(current.interactions.map(({ id }) => id));
  return result.interactions.find(({ id }) => !currentIds.has(id));
}

export function findSavedTrigger(
  result: TriggerMutationResult | Story,
  current: Story,
  interactionId: string,
  triggerId?: string,
): Trigger | undefined {
  if (!('interactions' in result)) return result.trigger;
  const triggers = result.interactions.find(({ id }) => id === interactionId)?.triggers ?? [];
  if (triggerId) return triggers.find(({ id }) => id === triggerId);
  const currentIds = new Set(
    current.interactions.find(({ id }) => id === interactionId)?.triggers.map(({ id }) => id) ?? [],
  );
  return triggers.find(({ id }) => !currentIds.has(id));
}

function upsertById<T extends { id: string }>(items: T[] | undefined, entity: T): T[] {
  return (items ?? []).some(({ id }) => id === entity.id)
    ? (items ?? []).map((item) => (item.id === entity.id ? entity : item))
    : [...(items ?? []), entity];
}

function patchById<T extends { id: string }>(
  items: T[] | undefined,
  entityId: string,
  patch: Partial<T>,
): T[] {
  return (items ?? []).map((item) => (item.id === entityId ? { ...item, ...patch } : item));
}
