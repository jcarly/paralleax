import type {
  CharacterItemMutationResult,
  CharacterMutationResult,
  CharacterStatMutationResult,
  GraphDecorationMutationResult,
  Interaction,
  InteractionMutationResult,
  LocationMutationResult,
  Story,
  Trigger,
  TriggerMutationResult,
} from '@paralleax/shared';

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
  const exists = (story.graphDecorations ?? []).some(({ id }) => id === result.decoration.id);
  return applyStoryMutationMetadata(
    {
      ...story,
      graphDecorations: exists
        ? (story.graphDecorations ?? []).map((decoration) =>
            decoration.id === result.decoration.id ? result.decoration : decoration,
          )
        : [...(story.graphDecorations ?? []), result.decoration],
    },
    result,
  );
}

export function applyLocationResult(story: Story, result: LocationMutationResult): Story {
  const exists = (story.locations ?? []).some(({ id }) => id === result.location.id);
  return applyStoryMutationMetadata(
    {
      ...story,
      locations: exists
        ? (story.locations ?? []).map((location) =>
            location.id === result.location.id ? result.location : location,
          )
        : [...(story.locations ?? []), result.location],
    },
    result,
  );
}

export function applyLocationPatchResult(
  story: Story,
  result: LocationMutationResult,
  locationId: string,
  patch: Partial<
    Pick<LocationMutationResult['location'], 'name' | 'description' | 'category' | 'imageUrl'>
  >,
): Story {
  return applyStoryMutationMetadata(
    {
      ...story,
      locations: (story.locations ?? []).map((location) =>
        location.id === locationId ? { ...location, ...patch } : location,
      ),
    },
    result,
  );
}

export function applyCharacterResult(story: Story, result: CharacterMutationResult): Story {
  const exists = (story.characters ?? []).some(({ id }) => id === result.character.id);
  return applyStoryMutationMetadata(
    {
      ...story,
      characters: exists
        ? (story.characters ?? []).map((character) =>
            character.id === result.character.id ? result.character : character,
          )
        : [...(story.characters ?? []), result.character],
    },
    result,
  );
}

export function applyCharacterPatchResult(
  story: Story,
  result: CharacterMutationResult,
  characterId: string,
  patch: Partial<
    Pick<
      CharacterMutationResult['character'],
      'name' | 'description' | 'category' | 'imageUrl' | 'isPlayable'
    >
  >,
): Story {
  return applyStoryMutationMetadata(
    {
      ...story,
      characters: (story.characters ?? []).map((character) =>
        character.id === characterId ? { ...character, ...patch } : character,
      ),
    },
    result,
  );
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
  patch: Partial<Pick<CharacterStatMutationResult['stat'], 'initialValue'>>,
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

export function applyInteractionMutationResult(
  story: Story,
  result: InteractionMutationResult,
): Story {
  const interaction = result.interaction;
  const exists = story.interactions.some(({ id }) => id === interaction.id);
  return applyStoryMutationMetadata(
    {
      ...story,
      interactions: exists
        ? story.interactions.map((item) => (item.id === interaction.id ? interaction : item))
        : [...story.interactions, interaction],
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
