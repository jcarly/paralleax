import { describe, expect, it } from 'vitest';
import type { NativeStoryContent } from './native-story.js';
import { remapNativeStoryContent, type NativeStoryIdMaps } from './native-story-remap.js';

function fixture(): NativeStoryContent {
  return {
    title: 'Story',
    statDefinitions: [{ id: 'def', name: 'Score' }],
    stats: [{ id: 'stat', statDefinitionId: 'def', initialValue: 2 }],
    itemDefinitions: [
      {
        id: 'item-def',
        name: 'Box',
        description: '',
        stats: [{ id: 'item-stat', statDefinitionId: 'def', initialValue: 1 }],
      },
    ],
    locations: [
      {
        id: 'place',
        name: 'Place',
        description: '',
        items: [
          { id: 'parent', itemDefinitionId: 'item-def' },
          {
            id: 'child',
            itemDefinitionId: 'item-def',
            parentItemId: 'parent',
            relationshipType: 'contained',
          },
        ],
      },
    ],
    characters: [{ id: 'person', name: 'Person', description: '' }],
    groups: [{ id: 'group', title: 'Group', interactionIds: ['scene'] }],
    graphDecorations: [
      {
        id: 'frame',
        kind: 'frame',
        color: '#000000',
        position: { x: 0, y: 0 },
        width: 200,
        height: 100,
      },
    ],
    interactions: fixtureInteractions(),
  };
}

function fixtureInteractions(): NativeStoryContent['interactions'] {
  return [
    {
      id: 'scene',
      title: 'Scene',
      body: '<span data-stat-value="stat">Score</span>',
      position: { x: 0, y: 0 },
      locationId: 'place',
      characterIds: ['person'],
      statEffects: [
        { statId: 'stat', operation: 'set', expression: '@{item-stat|child} + @{stat}' },
      ],
      itemEffects: [
        {
          itemId: 'child',
          itemDefinitionId: 'item-def',
          characterId: 'person',
          operation: 'obtain',
        },
      ],
      conditionalTextBlocks: [
        { id: 'block', conditions: [{ interactionId: 'scene', hasBeenVisited: true }] },
      ],
      triggers: [
        {
          id: 'trigger',
          inputInteractionIds: ['scene'],
          appearanceProbability: 50,
          conditionGroups: [
            {
              id: 'conditions',
              conditions: [
                {
                  statId: 'stat',
                  operator: 'eq',
                  comparisonStatId: 'item-stat',
                  comparisonItemId: 'child',
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}

function maps(): NativeStoryIdMaps {
  return Object.fromEntries(
    [
      'interaction:scene',
      'trigger:trigger',
      'character:person',
      'location:place',
      'statDefinition:def',
      'statAssignment:stat',
      'itemDefinition:item-def',
      'itemInstance:parent',
      'itemInstance:child',
      'group:group',
      'graphDecoration:frame',
    ].map((entry) => {
      const [kind, id] = entry.split(':');
      return [kind, new Map([[id, `new-${id}`]])];
    }),
  );
}

function expectRemappedInteraction(result: NativeStoryContent): void {
  expect(result.interactions[0]).toMatchObject({
    id: 'new-scene',
    locationId: 'new-place',
    characterIds: ['new-person'],
    body: '<span data-stat-value="new-stat">Score</span>',
    statEffects: [{ statId: 'new-stat', expression: '@{new-item-stat|new-child} + @{new-stat}' }],
    itemEffects: [
      { itemId: 'new-child', itemDefinitionId: 'new-item-def', characterId: 'new-person' },
    ],
    conditionalTextBlocks: [{ id: 'block', conditions: [{ interactionId: 'new-scene' }] }],
    triggers: [
      {
        id: 'new-trigger',
        probabilityKey: 'trigger',
        inputInteractionIds: ['new-scene'],
        conditionGroups: [
          {
            conditions: [
              {
                statId: 'new-stat',
                comparisonStatId: 'new-item-stat',
                comparisonItemId: 'new-child',
              },
            ],
          },
        ],
      },
    ],
  });
}

describe('native Story identifier remapping', () => {
  it('rewrites references and preserves the source', () => {
    const source = fixture();
    const original = structuredClone(source);
    const idMaps: NativeStoryIdMaps = {
      ...maps(),
      statAssignment: new Map([
        ['stat', 'new-stat'],
        ['item-stat', 'new-item-stat'],
      ]),
      itemInstance: new Map([
        ['parent', 'new-parent'],
        ['child', 'new-child'],
      ]),
    };
    const result = remapNativeStoryContent(source, idMaps, (body, replacements) =>
      body.replace(
        'data-stat-value="stat"',
        `data-stat-value="${replacements.statAssignment?.get('stat')}"`,
      ),
    );
    expect(source).toEqual(original);
    expect(result.stats?.[0]).toMatchObject({ id: 'new-stat', statDefinitionId: 'new-def' });
    expect(result.locations?.[0].items?.[1]).toMatchObject({
      id: 'new-child',
      parentItemId: 'new-parent',
      itemDefinitionId: 'new-item-def',
    });
    expect(result.groups?.[0]).toMatchObject({ id: 'new-group', interactionIds: ['new-scene'] });
    expectRemappedInteraction(result);
  });

  it('leaves an existing probability identity intact', () => {
    const source = fixture();
    source.interactions[0].triggers[0].probabilityKey = 'original-roll';
    const result = remapNativeStoryContent(source, maps(), (body) => body);
    expect(result.interactions[0].triggers[0].probabilityKey).toBe('original-roll');
  });

  it('preserves IDs and expression spelling when no remapping is needed', () => {
    const source = fixture();
    const result = remapNativeStoryContent(source, {}, (body) => body);
    expect(JSON.parse(JSON.stringify(result))).toEqual(source);
  });
});

it('rejects an invalid expression rather than rewriting unparsed text', () => {
  const source = fixture();
  const effect = source.interactions[0].statEffects?.[0];
  if (effect === undefined) {
    throw new Error('Missing fixture effect');
  }
  effect.expression = '@{stat';
  expect(() => remapNativeStoryContent(source, maps(), (body) => body)).toThrow(
    'Cannot remap an invalid expression',
  );
});
