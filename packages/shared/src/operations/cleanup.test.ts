import { describe, expect, it } from 'vitest';
import type { Story } from '../model/index.js';
import { getTriggerConditions } from '../triggers/model.js';
import { deleteItemInstanceFromStory } from './items.js';
import { deleteStatAssignmentsFromStory } from './stat-assignments.js';

function storyFixture(): Story {
  return {
    id: 'story-1',
    title: 'Cleanup',
    createdAt: '2026-10-16T08:00:00.000Z',
    updatedAt: '2026-10-16T08:00:00.000Z',
    statDefinitions: [{ id: 'energy-definition', name: 'Energy', valueType: 'number' }],
    characters: [
      {
        id: 'character-1',
        name: 'Mira',
        description: '',
        stats: [{ id: 'energy', statDefinitionId: 'energy-definition', initialValue: 4 }],
        items: [{ id: 'key', itemDefinitionId: 'key-definition' }],
      },
    ],
    itemDefinitions: [
      {
        id: 'key-definition',
        name: 'Key',
        description: '',
        stats: [{ id: 'durability', statDefinitionId: 'energy-definition', initialValue: 2 }],
      },
    ],
    interactions: [
      {
        id: 'root',
        title: 'Root',
        body: '',
        position: { x: 0, y: 0 },
        statEffects: [
          { statId: 'energy', operation: 'add', value: 1 },
          { statId: 'durability', itemId: 'key', operation: 'add', value: -1 },
        ],
        itemEffects: [{ itemId: 'key', operation: 'remove' }],
        triggers: [
          {
            id: 'start',
            inputInteractionIds: [],
            conditions: [
              { statId: 'energy', operator: 'gte', value: 1 },
              { statId: 'durability', itemId: 'key', operator: 'gte', value: 1 },
            ],
          },
        ],
      },
    ],
  };
}

describe('shared Story cleanup operations', () => {
  it('removes a stat assignment and every authored reference to it', () => {
    const story = storyFixture();
    const cleaned = deleteStatAssignmentsFromStory(story, new Set(['energy']));

    expect(cleaned.characters?.[0].stats).toEqual([]);
    expect(cleaned.interactions[0].statEffects).toEqual([
      { statId: 'durability', itemId: 'key', operation: 'add', value: -1 },
    ]);
    expect(getTriggerConditions(cleaned.interactions[0].triggers[0])).toEqual([
      { statId: 'durability', itemId: 'key', operator: 'gte', value: 1 },
    ]);
    expect(story.characters?.[0].stats).toHaveLength(1);
  });

  it('removes an item instance and every authored exact-item reference to it', () => {
    const story = storyFixture();
    const cleaned = deleteItemInstanceFromStory(story, 'key');

    expect(cleaned.characters?.[0].items).toEqual([]);
    expect(cleaned.interactions[0].itemEffects).toEqual([]);
    expect(cleaned.interactions[0].statEffects).toEqual([
      { statId: 'energy', operation: 'add', value: 1 },
    ]);
    expect(getTriggerConditions(cleaned.interactions[0].triggers[0])).toEqual([
      { statId: 'energy', operator: 'gte', value: 1 },
    ]);
    expect(story.characters?.[0].items).toHaveLength(1);
  });

  it('cleans expressions that reference a removed assignment or exact item', () => {
    const story = storyFixture();
    story.interactions[0].statEffects = [
      { statId: 'durability', itemId: 'key', operation: 'set', expression: '@{energy} + 1' },
      { statId: 'energy', operation: 'set', expression: '@{durability|key} + 1' },
    ];
    story.interactions[0].triggers[0].conditions = [
      { statId: 'energy', operator: 'gte', expression: '@{durability|key}' },
      { statId: 'durability', itemId: 'key', operator: 'gte', expression: '@{energy}' },
    ];
    story.interactions[0].conditionalTextBlocks = [
      {
        id: 'frame',
        conditions: [...story.interactions[0].triggers[0].conditions],
      },
      { id: 'other', conditions: [{ interactionId: 'root', hasBeenVisited: true }] },
    ];
    story.interactions[0].body =
      '<div data-conditional-text-block="frame"><p>Preserved <span data-conditional-text-block="other">content</span></p></div>';
    for (const cleaned of [
      deleteStatAssignmentsFromStory(story, new Set(['energy'])),
      deleteItemInstanceFromStory(story, 'key'),
    ]) {
      expect(cleaned.interactions[0].statEffects).toEqual([]);
      expect(getTriggerConditions(cleaned.interactions[0].triggers[0])).toEqual([]);
      expect(cleaned.interactions[0].conditionalTextBlocks).toEqual([
        { id: 'other', conditions: [{ interactionId: 'root', hasBeenVisited: true }] },
      ]);
      expect(cleaned.interactions[0].body).toBe(
        '<div><p>Preserved <span data-conditional-text-block="other">content</span></p></div>',
      );
    }
  });
});
