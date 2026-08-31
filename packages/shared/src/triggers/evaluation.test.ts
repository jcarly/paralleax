import { describe, expect, it } from 'vitest';
import type { Story } from '../model/stories.js';
import {
  deterministicTriggerRoll,
  doConditionsMatch,
  getAvailableInteractions,
  getTriggerProbabilityFailures,
} from './evaluation.js';

describe('condition group evaluation', () => {
  it('requires every condition in the group to match', () => {
    const conditions = [
      { interactionId: 'intro', hasBeenVisited: true },
      { statId: 'score', operator: 'gte' as const, value: 5 },
    ];

    expect(doConditionsMatch(conditions, new Set(['intro']), null, [], { score: 5 })).toBe(true);
    expect(doConditionsMatch(conditions, new Set(['intro']), null, [], { score: 4 })).toBe(false);
    expect(doConditionsMatch(conditions, new Set(), null, [], { score: 5 })).toBe(false);
  });
});

describe('Trigger groups and probability', () => {
  it('matches OR groups whose conditions are individually AND groups', () => {
    const story = probabilityStory({
      conditionGroups: [
        {
          id: 'visited-and-score',
          conditions: [
            { interactionId: 'start', hasBeenVisited: true },
            { statId: 'score', operator: 'gte', value: 10 },
          ],
        },
        {
          id: 'fallback',
          conditions: [{ statId: 'score', operator: 'gte', value: 2 }],
        },
      ],
    });

    expect(
      getAvailableInteractions(story, 'start', ['start'], null, [], { score: 2 }).map(
        ({ id }) => id,
      ),
    ).toContain('target');
  });

  it('uses one stable deterministic roll per Trigger and narrative step', () => {
    const first = deterministicTriggerRoll('saved-seed', 3, 'target-trigger');
    const replayed = deterministicTriggerRoll('saved-seed', 3, 'target-trigger');

    expect(replayed).toBe(first);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(100);
    expect(deterministicTriggerRoll('saved-seed', 4, 'target-trigger')).not.toBe(first);
  });

  it('reports a probability failure after inputs and one condition group match', () => {
    const story = probabilityStory({ appearanceProbability: 0 });
    const context = { randomSeed: 'saved-seed', step: 1 };

    expect(
      getAvailableInteractions(story, 'start', ['start'], null, [], {}, undefined, [], {}, context),
    ).not.toContainEqual(expect.objectContaining({ id: 'target' }));
    expect(
      getTriggerProbabilityFailures(story.interactions[1], 'start', ['start'], context),
    ).toEqual([
      expect.objectContaining({
        triggerId: 'target-trigger',
        appearanceProbability: 0,
      }),
    ]);
  });
});

function probabilityStory(
  patch: Partial<Story['interactions'][number]['triggers'][number]>,
): Story {
  return {
    id: 'probability-story',
    title: 'Probability',
    createdAt: '',
    updatedAt: '',
    interactions: [
      {
        id: 'start',
        title: 'Start',
        body: '',
        position: { x: 0, y: 0 },
        triggers: [{ id: 'start-trigger', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'target',
        title: 'Target',
        body: '',
        position: { x: 0, y: 100 },
        triggers: [
          {
            id: 'target-trigger',
            inputInteractionIds: ['start'],
            conditions: [],
            ...patch,
          },
        ],
      },
    ],
  };
}
