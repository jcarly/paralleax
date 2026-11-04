import { describe, expect, it } from 'vitest';
import type { Story } from '../model/stories.js';
import { applyInteractionItemStatChanges } from './replay.js';

const itemStatStory: Story = {
  id: 'story-1',
  title: 'Item stat replay',
  createdAt: '',
  updatedAt: '',
  statDefinitions: [{ id: 'number', name: 'Number', valueType: 'number', changePerHour: 2 }],
  itemDefinitions: [
    {
      id: 'battery',
      name: 'Battery',
      description: '',
      stats: [{ id: 'charge', statDefinitionId: 'number', initialValue: 0 }],
    },
  ],
  characters: [
    {
      id: 'mira',
      name: 'Mira',
      description: '',
      items: [
        { id: 'battery-1', itemDefinitionId: 'battery' },
        { id: 'battery-2', itemDefinitionId: 'battery' },
      ],
    },
  ],
  interactions: [
    {
      id: 'scene',
      title: 'Scene',
      body: '',
      position: { x: 0, y: 0 },
      durationMinutes: 30,
      triggers: [],
      statEffects: [
        {
          statId: 'charge',
          itemId: 'battery-1',
          operation: 'set',
          expression: '@{charge|battery-1} * 2',
        },
        {
          statId: 'charge',
          itemId: 'battery-2',
          operation: 'set',
          expression: '@{charge|battery-1} + @{charge|battery-2}',
        },
      ],
    },
  ],
};

describe('item stat replay', () => {
  it('advances item time before applying ordered effects without mutating its input', () => {
    const story = itemStatStory;
    const values = {
      'battery-1': { charge: 10 },
      'battery-2': { charge: 4 },
    };

    const result = applyInteractionItemStatChanges(story, values, story.interactions[0], [], {});

    expect(result).toEqual({
      'battery-1': { charge: 22 },
      'battery-2': { charge: 27 },
    });
    expect(values).toEqual({
      'battery-1': { charge: 10 },
      'battery-2': { charge: 4 },
    });
  });
});
