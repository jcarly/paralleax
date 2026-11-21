import { describe, expect, it } from 'vitest';
import type { Story } from '../model/stories.js';
import { projectNativeStory } from './native-story-projection.js';
import { nativeStoryContentSchema } from './native-story-schema.js';

function fixture(): Story {
  return {
    id: 'private-story-id',
    revision: 7,
    title: 'Example',
    startDateTime: '2026-01-01T12:00',
    createdAt: 'created',
    updatedAt: 'updated',
    access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
    locations: [
      {
        id: 'place',
        name: 'Place',
        description: '',
        items: [{ id: 'item', itemDefinitionId: 'object' }],
      },
    ],
    characters: [{ id: 'person', name: 'Person', description: '', isPlayable: true }],
    statDefinitions: [{ id: 'definition', name: 'Energy', valueType: 'number' }],
    stats: [{ id: 'stat', statDefinitionId: 'definition', initialValue: 1 }],
    itemDefinitions: [{ id: 'object', name: 'Object', description: '' }],
    groups: [{ id: 'group', title: 'Part', interactionIds: ['a', 'b'] }],
    graphDecorations: [
      {
        id: 'frame',
        kind: 'frame',
        color: '#000',
        position: { x: 0, y: 1 },
        width: 200,
        height: 100,
      },
    ],
    interactions: fixtureInteractions(),
  };
}

function fixtureInteractions(): Story['interactions'] {
  return [
    {
      id: 'a',
      title: 'A',
      body: '<span data-stat-value="stat">Energy</span>',
      position: { x: 1, y: 2 },
      triggers: [],
    },
    {
      id: 'b',
      title: 'B',
      body: '<div data-conditional-text-block="block">text</div>',
      position: { x: 2, y: 3 },
      locationId: 'place',
      characterIds: ['person'],
      durationMinutes: 5,
      statEffects: [{ statId: 'stat', operation: 'add', expression: '@{stat} + 1' }],
      itemEffects: [{ itemDefinitionId: 'object', characterId: 'person', operation: 'obtain' }],
      conditionalTextBlocks: [
        { id: 'block', conditions: [{ statId: 'stat', operator: 'gt', value: 0 }] },
      ],
      triggers: [
        {
          id: 'trigger',
          probabilityKey: 'original-trigger',
          inputInteractionIds: ['a', 'b'],
          appearanceProbability: 80,
          timerSeconds: 20,
          conditionGroups: [
            {
              id: 'conditions',
              conditions: [
                { interactionId: 'a', hasBeenVisited: true },
                {
                  temporal: {
                    weekdays: ['monday'],
                    timeSlots: [{ startTime: '09:00', endTime: '17:00' }],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}

describe('native Story projection', () => {
  it('preserves authored data and order without exporting Story identity or access', () => {
    const source = fixture();
    const result = projectNativeStory(source);
    expect(nativeStoryContentSchema.safeParse(result.story).success).toBe(true);
    expect(JSON.parse(JSON.stringify(result.story))).toEqual({
      title: source.title,
      startDateTime: source.startDateTime,
      locations: source.locations,
      characters: source.characters,
      stats: source.stats,
      statDefinitions: source.statDefinitions,
      itemDefinitions: source.itemDefinitions,
      groups: source.groups,
      graphDecorations: source.graphDecorations,
      interactions: source.interactions,
    });
    expect(result.format).toBe('paralleax.story');
    expect(result.version).toBe(1);
    expect(JSON.stringify(result)).not.toContain('private-story-id');
  });

  it('does not retain references to mutable authored collections', () => {
    const source = fixture();
    const result = projectNativeStory(source);
    result.story.interactions[1].triggers[0].inputInteractionIds.push('other');
    expect(source.interactions[1].triggers[0].inputInteractionIds).toEqual(['a', 'b']);
  });

  it('does not serialize unexpected persistence fields nested in authored entities', () => {
    const source = fixture();
    const interaction = { ...source.interactions[0], internalSecret: 'hidden-value' };
    const location = {
      id: 'place',
      name: 'Place',
      description: '',
      internalSecret: 'hidden-value',
    };
    source.interactions[0] = interaction;
    source.locations = [location];
    expect(JSON.stringify(projectNativeStory(source))).not.toContain('hidden-value');
  });
});
