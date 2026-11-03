import { describe, expect, it } from 'vitest';
import type { Story } from '@paralleax/shared';
import { createInteractionSearchIndex, searchInteractionIds } from './interactionSearch';

const story: Story = {
  id: 'story',
  title: 'Story',
  createdAt: '2026-10-28',
  updatedAt: '2026-10-28',
  locations: [{ id: 'harbor', name: 'Harbor', description: '' }],
  characters: [
    {
      id: 'mira',
      name: 'Mira',
      description: '',
      stats: [{ id: 'mira-resolve', statDefinitionId: 'resolve', initialValue: 1 }],
      items: [{ id: 'key-instance', itemDefinitionId: 'key' }],
    },
  ],
  statDefinitions: [
    { id: 'resolve', name: 'Resolve' },
    { id: 'trust', name: 'Trust' },
  ],
  itemDefinitions: [{ id: 'key', name: 'Silver Key', description: '' }],
  interactions: [
    {
      id: 'source',
      title: 'The overture',
      body: '<p>A forgotten map</p>',
      position: { x: 0, y: 0 },
      triggers: [{ id: 'root', inputInteractionIds: [] }],
    },
    {
      id: 'target',
      title: 'The final chapter',
      body: '',
      position: { x: 0, y: 100 },
      locationId: 'harbor',
      characterIds: ['mira'],
      statEffects: [{ statId: 'mira-resolve', operation: 'add', value: 1 }],
      itemEffects: [{ itemId: 'key-instance', operation: 'obtain' }],
      triggers: [
        {
          id: 'incoming',
          inputInteractionIds: ['source'],
          conditionGroups: [
            {
              id: 'conditions',
              conditions: [
                { characterId: 'mira', isPresent: true },
                { locationId: 'harbor', isCurrentLocation: true },
                { statId: 'mira-resolve', operator: 'gte', value: 3 },
                { itemDefinitionId: 'key', isOwned: true },
                { interactionId: 'source', hasBeenVisited: true },
                { temporal: { weekdays: ['friday'] } },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('interaction search index', () => {
  it('searches interaction titles and rich content without matching HTML tags', () => {
    const index = createInteractionSearchIndex(story);
    expect(searchInteractionIds(index, 'FINAL')).toEqual(['target']);
    expect(searchInteractionIds(index, 'forgotten map')).toEqual(['source']);
    expect(searchInteractionIds(index, 'p class')).toEqual([]);
  });

  it('searches present characters, locations, and effect targets by their names', () => {
    const index = createInteractionSearchIndex(story);
    for (const query of ['Mira', 'Harbor', 'Resolve', 'Silver Key']) {
      expect(searchInteractionIds(index, query)).toContain('target');
    }
  });

  it('searches incoming trigger sources and condition references and values', () => {
    const index = createInteractionSearchIndex(story);
    for (const query of ['overture', 'Mira', 'Harbor', 'Resolve', 'Silver Key', '3', 'Friday']) {
      expect(searchInteractionIds(index, query)).toContain('target');
    }
  });

  it('keeps Story order and returns no results for an empty query', () => {
    const index = createInteractionSearchIndex(story);
    expect(searchInteractionIds(index, 'the')).toEqual(['source', 'target']);
    expect(searchInteractionIds(index, '  ')).toEqual([]);
    expect(searchInteractionIds(createInteractionSearchIndex(undefined), 'the')).toEqual([]);
  });
});
