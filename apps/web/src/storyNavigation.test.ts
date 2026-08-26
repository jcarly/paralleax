import { describe, expect, it } from 'vitest';
import type { Story } from '@paralleax/shared';
import {
  countInteractionTextOccurrences,
  getInteractionTextOccurrenceCounts,
  getReferencedInteractionIds,
  getStoryContextCategorySuggestions,
  getStoryContextReferenceCounts,
  matchesStoryContextSearch,
} from './storyNavigation';

const story: Story = {
  id: 'story-1',
  title: 'Story',
  createdAt: '2026-08-02T00:00:00.000Z',
  updatedAt: '2026-08-02T00:00:00.000Z',
  locations: [
    {
      id: 'harbor',
      name: 'Harbor',
      description: '',
      items: [{ id: 'harbor-key', itemDefinitionId: 'key' }],
    },
  ],
  statDefinitions: [{ id: 'trust', name: 'Trust' }],
  itemDefinitions: [
    {
      id: 'key',
      name: 'Key',
      description: '',
      stats: [{ id: 'key-trust', statDefinitionId: 'trust', initialValue: 0 }],
    },
  ],
  characters: [
    {
      id: 'mira',
      name: 'Mira',
      description: '',
      stats: [{ id: 'mira-trust', statDefinitionId: 'trust', initialValue: 0 }],
      items: [{ id: 'mira-key', itemDefinitionId: 'key' }],
    },
  ],
  interactions: [
    {
      id: 'start',
      title: 'Meet Mira',
      body: '<p>Mira waits for Mira.</p>',
      position: { x: 0, y: 0 },
      locationId: 'harbor',
      characterIds: ['mira'],
      statEffects: [{ statId: 'mira-trust', operation: 'add', value: 1 }],
      itemEffects: [{ itemId: 'mira-key', operation: 'lose', characterId: 'mira' }],
      triggers: [{ id: 'root', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'locked',
      title: 'Locked route',
      body: '',
      position: { x: 0, y: 132 },
      statEffects: [{ itemId: 'mira-key', statId: 'key-trust', operation: 'add', value: 1 }],
      triggers: [
        {
          id: 'linked',
          inputInteractionIds: ['start'],
          conditions: [
            { locationId: 'harbor', isCurrentLocation: true },
            { characterId: 'mira', isPresent: true },
            { statId: 'mira-trust', operator: 'gte', value: 1 },
            { itemDefinitionId: 'key', isOwned: true },
          ],
        },
      ],
    },
    {
      id: 'inspect-location-item',
      title: 'Inspect location item',
      body: '',
      position: { x: 0, y: 264 },
      statEffects: [{ itemId: 'harbor-key', statId: 'key-trust', operation: 'add', value: 1 }],
      triggers: [{ id: 'inspect-linked', inputInteractionIds: ['locked'], conditions: [] }],
    },
  ],
};

describe('story navigation', () => {
  it('counts case-insensitive text occurrences in titles and rich bodies', () => {
    expect(countInteractionTextOccurrences(story.interactions[0], 'mira')).toBe(3);
    expect(getInteractionTextOccurrenceCounts(story, 'LOCKED')).toEqual(new Map([['locked', 1]]));
    expect(getInteractionTextOccurrenceCounts(story, '   ')).toEqual(new Map());
  });

  it('finds direct, condition, effect, and instance-backed context references', () => {
    expect(getReferencedInteractionIds(story, { type: 'location', id: 'harbor' })).toEqual([
      'start',
      'locked',
      'inspect-location-item',
    ]);
    expect(getReferencedInteractionIds(story, { type: 'character', id: 'mira' })).toEqual([
      'start',
      'locked',
    ]);
    expect(getReferencedInteractionIds(story, { type: 'stat', id: 'trust' })).toEqual([
      'start',
      'locked',
      'inspect-location-item',
    ]);
    expect(getReferencedInteractionIds(story, { type: 'item', id: 'key' })).toEqual([
      'start',
      'locked',
      'inspect-location-item',
    ]);
  });

  it('shares context-list filtering, categories, and compact assignment summaries', () => {
    expect(
      getStoryContextCategorySuggestions([
        { category: ' Crew ' },
        { category: 'Places' },
        { category: 'Crew' },
        {},
      ]),
    ).toEqual(['Crew', 'Places']);
    expect(matchesStoryContextSearch({ name: 'Mira', category: 'Crew' }, 'mir')).toBe(true);
    expect(matchesStoryContextSearch({ name: 'Mira', category: 'Crew' }, 'crew')).toBe(true);
    expect(matchesStoryContextSearch({ name: 'Mira', category: 'Crew' }, 'item')).toBe(false);

    const counts = getStoryContextReferenceCounts(story);
    expect(counts.locations).toEqual(new Map([['harbor', 1]]));
    expect(counts.characters).toEqual(new Map([['mira', 1]]));
    expect(counts.stats).toEqual(new Map([['trust', 2]]));
    expect(counts.items).toEqual(new Map([['key', 2]]));
  });
});
