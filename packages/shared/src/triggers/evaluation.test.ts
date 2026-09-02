import { describe, expect, it } from 'vitest';
import type { Story } from '../model/stories.js';
import {
  deterministicTriggerRoll,
  doConditionsMatch,
  getAvailableInteractions,
  getInteractionTimerState,
  getTriggerProbabilityFailures,
  getTriggerTimerFailures,
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

describe('Trigger timers', () => {
  const context = { randomSeed: 'saved-seed', step: 1 };

  it('keeps an untimed Trigger available indefinitely', () => {
    const story = probabilityStory({ timerSeconds: null });

    expect(
      getAvailableInteractions(
        story,
        'start',
        ['start'],
        null,
        [],
        {},
        undefined,
        [],
        {},
        {
          ...context,
          elapsedTimeMs: 60_000,
        },
      ),
    ).toContainEqual(expect.objectContaining({ id: 'target' }));
  });

  it('expires a timed Trigger at its exact boundary', () => {
    const story = probabilityStory({ timerSeconds: 5 });
    const interaction = story.interactions[1];
    const beforeExpiry = { ...context, elapsedTimeMs: 4_000 };

    expect(
      getAvailableInteractions(
        story,
        'start',
        ['start'],
        null,
        [],
        {},
        undefined,
        [],
        {},
        beforeExpiry,
      ),
    ).toContainEqual(expect.objectContaining({ id: 'target' }));
    expect(getInteractionTimerState(interaction, 'start', ['start'], beforeExpiry)).toMatchObject({
      timerSeconds: 5,
      remainingTimeMs: 1_000,
      remainingRatio: 0.2,
      expired: false,
    });
    const expired = { ...context, elapsedTimeMs: 5_000 };
    expect(
      getAvailableInteractions(story, 'start', ['start'], null, [], {}, undefined, [], {}, expired),
    ).not.toContainEqual(expect.objectContaining({ id: 'target' }));
    expect(getTriggerTimerFailures(interaction, 'start', ['start'], expired)).toEqual([
      { triggerId: 'target-trigger', timerSeconds: 5, elapsedTimeMs: 5_000 },
    ]);
  });

  it('never exposes a zero-second Trigger', () => {
    const story = probabilityStory({ timerSeconds: 0 });

    expect(
      getAvailableInteractions(story, 'start', ['start'], null, [], {}, undefined, [], {}, context),
    ).not.toContainEqual(expect.objectContaining({ id: 'target' }));
    expect(getTriggerTimerFailures(story.interactions[1], 'start', ['start'], context)).toEqual([
      { triggerId: 'target-trigger', timerSeconds: 0, elapsedTimeMs: 0 },
    ]);
  });

  it('keeps an option untimed when another eligible Trigger has no timer', () => {
    const story = probabilityStory({ timerSeconds: 1 });
    story.interactions[1].triggers.push({
      id: 'untimed-trigger',
      inputInteractionIds: ['start'],
      conditionGroups: [{ id: 'untimed-group', conditions: [] }],
      appearanceProbability: 100,
      timerSeconds: null,
    });
    const elapsed = { ...context, elapsedTimeMs: 2_000 };

    expect(
      getAvailableInteractions(story, 'start', ['start'], null, [], {}, undefined, [], {}, elapsed),
    ).toContainEqual(expect.objectContaining({ id: 'target' }));
    expect(getInteractionTimerState(story.interactions[1], 'start', ['start'], elapsed)).toBeNull();
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
