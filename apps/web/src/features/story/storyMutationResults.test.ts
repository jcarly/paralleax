import { describe, expect, it } from 'vitest';
import type { Interaction, Story, Trigger } from '@paralleax/shared';
import {
  applyCharacterItemResult,
  applyCharacterPatchResult,
  applyCharacterResult,
  applyCharacterStatResult,
  applyGraphDecorationResult,
  applyInteractionMutationResult,
  applyLocationPatchResult,
  applyLocationResult,
  applyTriggerMutationResult,
  findSavedInteraction,
  findSavedTrigger,
  updateLocalCharacterStat,
} from './storyMutationResults';

const updatedAt = '2026-08-25T12:00:00.000Z';

describe('story mutation result adapters', () => {
  it('adds or replaces compact interaction results and applies their metadata', () => {
    const story = storyFixture();
    const added = interaction('new', 'New');
    const withAdded = applyInteractionMutationResult(story, {
      interaction: added,
      revision: 2,
      updatedAt,
    });
    const replaced = interaction('root', 'Updated root');
    const withReplacement = applyInteractionMutationResult(withAdded, {
      interaction: replaced,
      revision: 3,
      updatedAt,
    });

    expect(withAdded.interactions.at(-1)).toEqual(added);
    expect(withReplacement.interactions[0]).toEqual(replaced);
    expect(withReplacement).toMatchObject({ revision: 3, updatedAt });
    expect(story.interactions).toHaveLength(1);
  });

  it('finds saved interactions in compact and complete-story responses', () => {
    const story = storyFixture();
    const added = interaction('new', 'New');
    const fullResponse = { ...story, interactions: [...story.interactions, added] };

    expect(findSavedInteraction({ interaction: added, revision: 2, updatedAt }, story)).toEqual(
      added,
    );
    expect(findSavedInteraction(fullResponse, story)).toEqual(added);
    expect(findSavedInteraction(fullResponse, story, 'root')).toEqual(story.interactions[0]);
  });

  it('adds, replaces, and locates trigger results', () => {
    const story = storyFixture();
    const added: Trigger = { id: 'alternative', inputInteractionIds: [], conditions: [] };
    const withAdded = applyTriggerMutationResult(story, {
      interactionId: 'root',
      trigger: added,
      revision: 2,
      updatedAt,
    });
    const replaced: Trigger = {
      id: 'root-trigger',
      inputInteractionIds: ['source'],
      conditions: [],
    };
    const withReplacement = applyTriggerMutationResult(withAdded, {
      interactionId: 'root',
      trigger: replaced,
      revision: 3,
      updatedAt,
    });

    expect(withAdded.interactions[0].triggers.at(-1)).toEqual(added);
    expect(withReplacement.interactions[0].triggers[0]).toEqual(replaced);
    expect(findSavedTrigger(withAdded, story, 'root')).toEqual(added);
    expect(findSavedTrigger(withReplacement, story, 'root', 'root-trigger')).toEqual(replaced);
    expect(
      findSavedTrigger(
        { interactionId: 'root', trigger: added, revision: 2, updatedAt },
        story,
        'root',
      ),
    ).toEqual(added);
  });

  it('applies decoration, location, and character creation or patch results', () => {
    const story = storyFixture();
    const withDecoration = applyGraphDecorationResult(story, {
      decoration: {
        id: 'frame',
        kind: 'frame',
        position: { x: 1, y: 2 },
        width: 300,
        height: 200,
        color: '#ffffff',
      },
      revision: 2,
      updatedAt,
    });
    const withLocation = applyLocationResult(withDecoration, {
      location: { id: 'harbor', name: 'Harbor', description: '' },
      revision: 3,
      updatedAt,
    });
    const patchedLocation = applyLocationPatchResult(
      withLocation,
      {
        location: { id: 'harbor', name: 'Stale', description: '' },
        revision: 4,
        updatedAt,
      },
      'harbor',
      { name: 'Port' },
    );
    const withCharacter = applyCharacterResult(patchedLocation, {
      character: { id: 'luc', name: 'Luc', description: '' },
      revision: 5,
      updatedAt,
    });
    const patchedCharacter = applyCharacterPatchResult(
      withCharacter,
      {
        character: { id: 'luc', name: 'Stale', description: '' },
        revision: 6,
        updatedAt,
      },
      'luc',
      { name: 'Lucien', isPlayable: true },
    );

    expect(withDecoration.graphDecorations?.[0].id).toBe('frame');
    expect(patchedLocation.locations?.find(({ id }) => id === 'harbor')?.name).toBe('Port');
    expect(patchedCharacter.characters?.find(({ id }) => id === 'luc')).toMatchObject({
      name: 'Lucien',
      isPlayable: true,
    });
  });

  it('applies character stat and item results while keeping local stat patches focused', () => {
    const story = storyFixture();
    const withStat = applyCharacterStatResult(story, {
      characterId: 'mira',
      stat: { id: 'trust', statDefinitionId: 'trust-definition', initialValue: 1 },
      revision: 2,
      updatedAt,
    });
    const patchedStat = updateLocalCharacterStat(withStat, 'mira', 'trust', {
      initialValue: 4,
    });
    const withItem = applyCharacterItemResult(patchedStat, {
      characterId: 'mira',
      item: { id: 'key', itemDefinitionId: 'key-definition' },
      revision: 3,
      updatedAt,
    });

    expect(patchedStat.characters?.[0].stats?.[0].initialValue).toBe(4);
    expect(withItem.characters?.[0].items).toEqual([
      { id: 'key', itemDefinitionId: 'key-definition' },
    ]);
  });
});

function storyFixture(): Story {
  return {
    id: 'story',
    title: 'Story',
    interactions: [interaction('root', 'Root')],
    characters: [{ id: 'mira', name: 'Mira', description: '' }],
    createdAt: '2026-08-25T00:00:00.000Z',
    updatedAt: '2026-08-25T00:00:00.000Z',
  };
}

function interaction(id: string, title: string): Interaction {
  return {
    id,
    title,
    body: '',
    position: { x: 0, y: 0 },
    triggers: [{ id: `${id}-trigger`, inputInteractionIds: [], conditions: [] }],
  };
}
