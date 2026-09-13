import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';
import type { Interaction, StatValue, Story, Trigger, TriggerCondition } from '@paralleax/shared';
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

  it('returns no reason when a trigger is available', () => {
    const story = storyFixture();
    expect(
      getUnavailableReason(
        story,
        story.interactions[2],
        'source',
        ['start'],
        null,
        [],
        {},
        '2000-01-03T08:00',
        ['key'],
        {},
        t,
      ),
    ).toBeUndefined();
  });

  it('distinguishes probability and timer failures after conditions pass', () => {
    const story = storyFixture();
    const probability = optionWith({ appearanceProbability: 0 });
    const timer = optionWith({ timerSeconds: 0 });

    expect(
      getUnavailableReason(
        story,
        probability,
        'source',
        [],
        null,
        [],
        {},
        '2000-01-03T08:00',
        [],
        {},
        t,
        { randomSeed: 'seed', step: 1 },
      ),
    ).toBe('player.requirement.probabilityFailed');
    expect(
      getUnavailableReason(
        story,
        timer,
        'source',
        [],
        null,
        [],
        {},
        '2000-01-03T08:00',
        [],
        {},
        t,
        { randomSeed: 'seed', step: 1, elapsedTimeMs: 0 },
      ),
    ).toBe('player.requirement.timerExpired');
  });

  it.each(failureCases)('presents a failed $expected requirement', (testCase) => {
    const story = storyFixture();
    const interaction = optionWith({ conditions: [testCase.condition] });

    expect(
      getUnavailableReason(
        story,
        interaction,
        'source',
        testCase.visited ?? [],
        testCase.currentLocationId ?? null,
        testCase.currentCharacterIds ?? [],
        testCase.statValues ?? {},
        '2000-01-04T08:00',
        testCase.ownedItemDefinitionIds ?? [],
        {},
        t,
      ),
    ).toBe(testCase.expected);
  });

  it('summarizes roots, conditional roots, and unmatched inputs', () => {
    const story = storyFixture();
    const root = optionWith({ inputInteractionIds: [] });
    const conditionalRoot = optionWith({
      inputInteractionIds: [],
      conditions: [{ interactionId: 'start', hasBeenVisited: true }],
    });

    expect(getConditionSummary(story, root, null, t)).toBe('always');
    expect(getConditionSummary(story, conditionalRoot, 'other', t)).toBe('visited:Start');
    expect(getConditionSummary(story, root, 'other', t)).toBe('player.condition.noMatching');
  });
});

interface FailureCase {
  condition: TriggerCondition;
  expected: string;
  visited?: string[];
  currentLocationId?: string;
  currentCharacterIds?: string[];
  statValues?: Record<string, StatValue>;
  ownedItemDefinitionIds?: string[];
}

const failureCases: FailureCase[] = [
  {
    condition: { interactionId: 'start', hasBeenVisited: true },
    expected: 'player.requirement.visited',
  },
  {
    condition: { interactionId: 'missing', hasBeenVisited: false },
    visited: ['missing'],
    expected: 'player.requirement.notVisited',
  },
  {
    condition: { locationId: 'bridge', isCurrentLocation: false },
    currentLocationId: 'bridge',
    expected: 'player.requirement.locationIsNot',
  },
  {
    condition: { itemDefinitionId: 'key', isOwned: true },
    expected: 'player.requirement.owns',
  },
  {
    condition: { itemDefinitionId: 'missing', isOwned: false },
    ownedItemDefinitionIds: ['missing'],
    expected: 'player.requirement.doesNotOwn',
  },
  {
    condition: { characterId: 'mira', isPresent: true },
    expected: 'player.requirement.present',
  },
  {
    condition: { characterId: 'missing', isPresent: false },
    currentCharacterIds: ['missing'],
    expected: 'player.requirement.absent',
  },
  {
    condition: { statId: 'courage', operator: 'gte', value: 2 },
    statValues: { courage: 1 },
    expected: 'player.requirement.stat',
  },
  {
    condition: { statId: 'missing-stat', itemId: 'missing-item', operator: 'eq', value: true },
    expected: 'player.requirement.stat',
  },
  {
    condition: { temporal: { weekdays: ['monday'] } },
    expected: 'player.requirement.temporal',
  },
];

function optionWith(trigger: Partial<Trigger>): Interaction {
  return {
    id: 'option',
    title: 'Option',
    body: '',
    position: { x: 0, y: 0 },
    triggers: [
      {
        id: 'option-trigger',
        inputInteractionIds: ['source'],
        conditions: [],
        ...trigger,
      },
    ],
  };
}

function storyFixture(): Story {
  return {
    id: 'story-1',
    title: 'Presentation',
    createdAt: '2026-08-26T08:00:00.000Z',
    updatedAt: '2026-08-26T08:00:00.000Z',
    locations: [{ id: 'bridge', name: 'Bridge', description: '', stats: [], items: [] }],
    characters: [{ id: 'mira', name: 'Mira', description: '' }],
    stats: [{ id: 'courage', statDefinitionId: 'courage-definition', initialValue: 0 }],
    statDefinitions: [{ id: 'courage-definition', name: 'Courage', valueType: 'number' }],
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
