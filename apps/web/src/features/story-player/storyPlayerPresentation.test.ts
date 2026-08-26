import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import type { Story } from '@paralleax/shared';
import { getConditionSummary, getUnavailableReason } from './storyPlayerPresentation';

const t = ((key: string, options?: Record<string, unknown>) => {
  if (key === 'player.condition.and') return 'AND';
  if (key === 'player.condition.or') return 'OR';
  if (key === 'player.condition.noConditions') return 'always';
  if (key === 'player.condition.visited') return `visited:${options?.title}`;
  if (key === 'player.condition.owns') return `owns:${options?.name}`;
  if (key === 'player.requirement.locationIs') return `location:${options?.name}`;
  return key;
}) as unknown as TFunction;

describe('story player presentation', () => {
  it('presents trigger conditions as AND clauses and trigger variants as OR clauses', () => {
    const story = storyFixture();

    expect(getConditionSummary(story, story.interactions[2], 'source', t)).toBe(
      'visited:Start AND owns:Key OR always',
    );
  });

  it('presents the first failed trigger requirement without owning its semantics', () => {
    const story = storyFixture();

    expect(
      getUnavailableReason(
        story,
        story.interactions[3],
        'source',
        ['source'],
        null,
        [],
        {},
        '2000-01-03T08:00',
        [],
        {},
        t,
      ),
    ).toBe('location:Bridge');
  });
});

function storyFixture(): Story {
  return {
    id: 'story-1',
    title: 'Presentation',
    createdAt: '2026-08-26T08:00:00.000Z',
    updatedAt: '2026-08-26T08:00:00.000Z',
    locations: [{ id: 'bridge', name: 'Bridge', description: '', stats: [], items: [] }],
    itemDefinitions: [{ id: 'key', name: 'Key', description: '', imageUrl: '', stats: [] }],
    interactions: [
      {
        id: 'start',
        title: 'Start',
        body: '',
        position: { x: 0, y: 0 },
        triggers: [{ id: 'start-trigger', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'source',
        title: 'Source',
        body: '',
        position: { x: 100, y: 0 },
        triggers: [{ id: 'source-trigger', inputInteractionIds: ['start'], conditions: [] }],
      },
      {
        id: 'target',
        title: 'Target',
        body: '',
        position: { x: 200, y: 0 },
        triggers: [
          {
            id: 'conditional-trigger',
            inputInteractionIds: ['source'],
            conditions: [
              { interactionId: 'start', hasBeenVisited: true },
              { itemDefinitionId: 'key', isOwned: true },
            ],
          },
          { id: 'fallback-trigger', inputInteractionIds: ['source'], conditions: [] },
        ],
      },
      {
        id: 'located',
        title: 'Located',
        body: '',
        position: { x: 300, y: 0 },
        triggers: [
          {
            id: 'located-trigger',
            inputInteractionIds: ['source'],
            conditions: [{ locationId: 'bridge', isCurrentLocation: true }],
          },
        ],
      },
    ],
  };
}
