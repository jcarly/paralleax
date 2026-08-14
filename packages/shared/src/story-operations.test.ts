import { describe, expect, it } from 'vitest';
import {
  deleteInteractionFromStory,
  deleteTriggerInStory,
  createDemoStory,
  ensureStoryInteractionPositions,
  addStoryMinutes,
  buildReaderProgressState,
  getJourneyStatValues,
  getJourneyDateTime,
  getAvailableInteractions,
  getInputReachableInteractions,
  getItemDefinitionIdForInstance,
  getItemOwnerIdForInstance,
  getNextChildPosition,
  getNextParentPosition,
  getNextRootPosition,
  getTriggerConditionFailures,
  mergeServerStory,
  normalizeTriggerInputIds,
  updateTriggerInStory,
  type Story,
} from './index';

function storyFixture(): Story {
  return {
    id: 'story-1',
    title: 'Story',
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
    interactions: [
      {
        id: 'root',
        title: 'Root',
        body: 'Start',
        position: { x: 80, y: 120 },
        triggers: [{ id: 'trigger-root', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'middle',
        title: 'Middle',
        body: 'Middle body',
        position: { x: 80, y: 270 },
        triggers: [{ id: 'trigger-middle', inputInteractionIds: ['root'], conditions: [] }],
      },
      {
        id: 'end',
        title: 'End',
        body: 'End body',
        position: { x: 80, y: 420 },
        triggers: [
          {
            id: 'trigger-end',
            inputInteractionIds: ['root', 'middle'],
            conditions: [{ interactionId: 'root', hasBeenVisited: true }],
          },
        ],
      },
    ],
  };
}

describe('shared story operations', () => {
  it('creates a demo story covering roots, branches, multi-input triggers, and conditions', () => {
    const story = createDemoStory('demo-story', '2026-07-14T08:00:00.000Z');

    expect(story).toMatchObject({
      id: 'demo-story',
      title: 'Demo: branching investigation',
      createdAt: '2026-07-14T08:00:00.000Z',
      updatedAt: '2026-07-14T08:00:00.000Z',
    });
    expect(story.interactions).toHaveLength(9);
    expect(story.interactions.every((interaction) => interaction.triggers.length >= 1)).toBe(true);
    expect(
      story.interactions.filter((interaction) =>
        interaction.triggers.some((trigger) => trigger.inputInteractionIds.length === 0),
      ),
    ).toHaveLength(2);
    expect(
      story.interactions.some((interaction) =>
        interaction.triggers.some((trigger) => trigger.inputInteractionIds.length > 1),
      ),
    ).toBe(true);
    expect(
      story.interactions.some((interaction) =>
        interaction.triggers.some((trigger) => trigger.conditions.length > 0),
      ),
    ).toBe(true);
  });

  it('deduplicates trigger inputs when updating a trigger', () => {
    const updated = updateTriggerInStory(storyFixture(), 'end', 'trigger-end', {
      inputInteractionIds: ['root', 'root', 'middle'],
      conditions: [],
    });

    expect(updated.interactions[2].triggers[0].inputInteractionIds).toEqual(['root', 'middle']);
  });

  it('updates only a trigger canvas position when given a position patch', () => {
    const updated = updateTriggerInStory(storyFixture(), 'middle', 'trigger-middle', {
      position: { x: 240, y: 315 },
    });

    expect(updated.interactions[1].triggers[0]).toEqual({
      id: 'trigger-middle',
      inputInteractionIds: ['root'],
      conditions: [],
      position: { x: 240, y: 315 },
    });
  });

  it('removes only the requested trigger from its output interaction', () => {
    const story = storyFixture();
    story.interactions[2].triggers.push({
      id: 'trigger-alt',
      inputInteractionIds: ['middle'],
      conditions: [],
    });

    const updated = deleteTriggerInStory(story, 'end', 'trigger-end');

    expect(updated.interactions[2].triggers).toEqual([
      { id: 'trigger-alt', inputInteractionIds: ['middle'], conditions: [] },
    ]);
  });

  it('turns the last trigger of an interaction into a root trigger', () => {
    const updated = deleteTriggerInStory(storyFixture(), 'middle', 'trigger-middle');

    expect(updated.interactions[1].triggers).toEqual([
      { id: 'trigger-middle', inputInteractionIds: [], conditions: [] },
    ]);
  });

  it('keeps triggers as root triggers when deleting their only input interaction', () => {
    const updated = deleteInteractionFromStory(storyFixture(), 'root');

    expect(updated.interactions.map((item) => item.id)).toEqual(['middle', 'end']);
    expect(updated.interactions[0].triggers).toEqual([
      { id: 'trigger-middle', inputInteractionIds: [], conditions: [] },
    ]);
    expect(updated.interactions[1].triggers[0].inputInteractionIds).toEqual(['middle']);
    expect(updated.interactions[1].triggers[0].conditions).toEqual([]);
  });

  it('does not restore locally deleted triggers from stale server stories', () => {
    const story = storyFixture();
    story.interactions[1].triggers.push({
      id: 'trigger-middle-alt',
      inputInteractionIds: [],
      conditions: [],
    });
    const current = deleteTriggerInStory(story, 'middle', 'trigger-middle');
    const staleIncoming = structuredClone(story);

    const merged = mergeServerStory(current, staleIncoming, undefined, {
      deletedTriggerIds: new Set(['trigger-middle']),
    });

    expect(merged.interactions[1].triggers).toEqual([
      { id: 'trigger-middle-alt', inputInteractionIds: [], conditions: [] },
    ]);
  });

  it('does not restore locally deleted trigger inputs from stale server stories', () => {
    const current = updateTriggerInStory(storyFixture(), 'middle', 'trigger-middle', {
      inputInteractionIds: [],
      conditions: [],
    });
    const staleIncoming = storyFixture();

    const merged = mergeServerStory(current, staleIncoming, undefined, {
      deletedTriggerInputKeys: new Set(['trigger-middle:root']),
    });

    expect(merged.interactions[1].triggers).toEqual([
      { id: 'trigger-middle', inputInteractionIds: [], conditions: [] },
    ]);
  });

  it('preserves local triggers when merging interaction-only saves', () => {
    const story = storyFixture();
    story.interactions[1].triggers.push({
      id: 'trigger-middle-alt',
      inputInteractionIds: [],
      conditions: [],
    });
    const current = deleteTriggerInStory(story, 'middle', 'trigger-middle');
    const staleIncoming = structuredClone(story);
    staleIncoming.interactions[1].position = { x: 445, y: 275 };

    const merged = mergeServerStory(
      current,
      staleIncoming,
      {
        interactionId: 'middle',
        patch: { position: { x: 445, y: 275 } },
      },
      { preserveCurrentTriggers: true },
    );

    expect(merged.interactions[1].position).toEqual({ x: 445, y: 275 });
    expect(merged.interactions[1].triggers).toEqual([
      { id: 'trigger-middle-alt', inputInteractionIds: [], conditions: [] },
    ]);
  });

  it('fills missing interaction positions with stable defaults', () => {
    const story = storyFixture();
    delete (story.interactions[1] as Partial<Story['interactions'][number]>).position;

    expect(ensureStoryInteractionPositions(story).interactions[1].position).toEqual({
      x: 80,
      y: 252,
    });
  });

  it('finds the next child position below occupied vertical outputs', () => {
    const story = storyFixture();

    expect(getNextChildPosition(story, story.interactions[0])).toEqual({ x: 80, y: 648 });
  });

  it('finds the next child position when the parent has no stored position', () => {
    const story = storyFixture();
    delete (story.interactions[1] as Partial<Story['interactions'][number]>).position;

    expect(getNextChildPosition(story, story.interactions[1])).toEqual({ x: 80, y: 648 });
  });

  it('finds the next parent position above the target without overlap', () => {
    const story = storyFixture();
    story.interactions.push({
      id: 'other-parent',
      title: 'Other parent',
      body: 'Already there',
      position: { x: 80, y: 270 },
      triggers: [{ id: 'trigger-other-parent', inputInteractionIds: [], conditions: [] }],
    });

    expect(getNextParentPosition(story, story.interactions[2])).toEqual({ x: 80, y: -108 });
  });

  it('finds the next root position below the lowest existing root', () => {
    const story = storyFixture();
    story.interactions.push({
      id: 'second-root',
      title: 'Second root',
      body: 'Another start',
      position: { x: 80, y: 520 },
      triggers: [{ id: 'trigger-second-root', inputInteractionIds: [], conditions: [] }],
    });

    expect(getNextRootPosition(story)).toEqual({ x: 80, y: 652 });
  });

  it('normalizes trigger inputs without changing their first-seen order', () => {
    expect(normalizeTriggerInputIds(['b', 'a', 'b', 'c'])).toEqual(['b', 'a', 'c']);
  });

  it('keeps inputless triggers without conditions available only at story start', () => {
    const story = storyFixture();

    expect(getAvailableInteractions(story, null, []).map((item) => item.id)).toEqual(['root']);
    expect(getAvailableInteractions(story, 'root', ['root']).map((item) => item.id)).toEqual([
      'middle',
      'end',
    ]);
  });

  it('evaluates inputless triggers with conditions during reading', () => {
    const story = storyFixture();
    story.interactions.push({
      id: 'contextual',
      title: 'Contextual',
      body: 'Available after root without a direct input.',
      position: { x: 320, y: 270 },
      triggers: [
        {
          id: 'trigger-contextual',
          inputInteractionIds: [],
          conditions: [{ interactionId: 'root', hasBeenVisited: true }],
        },
      ],
    });

    expect(getAvailableInteractions(story, null, []).map((item) => item.id)).toEqual(['root']);
    expect(
      getAvailableInteractions(story, 'middle', ['root', 'middle']).map((item) => item.id),
    ).toEqual(['end', 'contextual']);
  });

  it('deduplicates interactions made available by several eligible triggers', () => {
    const story = storyFixture();
    story.interactions[2].triggers.push({
      id: 'trigger-end-contextual',
      inputInteractionIds: [],
      conditions: [{ interactionId: 'middle', hasBeenVisited: true }],
    });

    expect(
      getAvailableInteractions(story, 'middle', ['root', 'middle']).map((item) => item.id),
    ).toEqual(['end']);
  });

  it('lists input-reachable interactions without applying trigger conditions', () => {
    const story = storyFixture();
    story.interactions.push({
      id: 'unrelated',
      title: 'Unrelated',
      body: 'Not reachable from the current input.',
      position: { x: 320, y: 270 },
      triggers: [
        {
          id: 'trigger-unrelated',
          inputInteractionIds: ['end'],
          conditions: [],
        },
      ],
    });

    expect(getInputReachableInteractions(story, 'root').map((item) => item.id)).toEqual([
      'middle',
      'end',
    ]);
    expect(getAvailableInteractions(story, 'root', []).map((item) => item.id)).toEqual(['middle']);
  });

  it('explains failed trigger conditions for input-reachable interactions', () => {
    const story = storyFixture();

    expect(getTriggerConditionFailures(story.interactions[2], 'root', [])).toEqual([
      {
        triggerId: 'trigger-end',
        condition: { interactionId: 'root', hasBeenVisited: true },
      },
    ]);
  });

  it('does not report condition failures when another matching trigger is eligible', () => {
    const story = storyFixture();
    story.interactions[2].triggers.push({
      id: 'trigger-end-unconditional',
      inputInteractionIds: ['root'],
      conditions: [],
    });

    expect(getTriggerConditionFailures(story.interactions[2], 'root', [])).toEqual([]);
  });

  it('evaluates current-location trigger conditions', () => {
    const story = storyFixture();
    story.locations = [{ id: 'harbor', name: 'Harbor', description: '' }];
    story.interactions[1].triggers[0].conditions = [
      { locationId: 'harbor', isCurrentLocation: true },
    ];

    expect(
      getAvailableInteractions(story, 'root', ['root'], 'harbor').map((item) => item.id),
    ).toContain('middle');
    expect(
      getAvailableInteractions(story, 'root', ['root'], null).map((item) => item.id),
    ).not.toContain('middle');
    expect(getTriggerConditionFailures(story.interactions[1], 'root', [], null)).toEqual([
      {
        triggerId: 'trigger-middle',
        condition: { locationId: 'harbor', isCurrentLocation: true },
      },
    ]);
  });

  it('supports triggers that forbid the current location', () => {
    const story = storyFixture();
    story.interactions[1].triggers[0].conditions = [
      { locationId: 'harbor', isCurrentLocation: false },
    ];

    expect(
      getAvailableInteractions(story, 'root', ['root'], null).map((item) => item.id),
    ).toContain('middle');
    expect(
      getAvailableInteractions(story, 'root', ['root'], 'harbor').map((item) => item.id),
    ).not.toContain('middle');
  });

  it('evaluates character presence conditions from the current interaction', () => {
    const story = storyFixture();
    story.characters = [{ id: 'mira', name: 'Mira', description: '' }];
    story.interactions[1].triggers[0].conditions = [{ characterId: 'mira', isPresent: true }];

    expect(
      getAvailableInteractions(story, 'root', ['root'], null, ['mira']).map((item) => item.id),
    ).toContain('middle');
    expect(
      getAvailableInteractions(story, 'root', ['root'], null, []).map((item) => item.id),
    ).not.toContain('middle');
    expect(getTriggerConditionFailures(story.interactions[1], 'root', [], null, [])).toEqual([
      {
        triggerId: 'trigger-middle',
        condition: { characterId: 'mira', isPresent: true },
      },
    ]);
  });

  it('supports triggers that require a character to be absent', () => {
    const story = storyFixture();
    story.interactions[1].triggers[0].conditions = [{ characterId: 'mira', isPresent: false }];

    expect(
      getAvailableInteractions(story, 'root', ['root'], null, []).map((item) => item.id),
    ).toContain('middle');
    expect(
      getAvailableInteractions(story, 'root', ['root'], null, ['mira']).map((item) => item.id),
    ).not.toContain('middle');
  });
});

describe('character stats', () => {
  it('applies add and set effects in journey order and evaluates stat conditions', () => {
    const story = storyFixture();
    story.characters = [
      {
        id: 'mira',
        name: 'Mira',
        description: '',
        stats: [{ id: 'trust', statDefinitionId: 'trust-definition', initialValue: 2 }],
      },
    ];
    story.statDefinitions = [{ id: 'trust-definition', name: 'Trust' }];
    story.interactions[0].statEffects = [{ statId: 'trust', operation: 'add', value: 3 }];
    story.interactions[1].statEffects = [{ statId: 'trust', operation: 'set', value: 10 }];
    story.interactions[1].triggers[0].conditions = [{ statId: 'trust', operator: 'gte', value: 5 }];

    const afterRoot = getJourneyStatValues(story, ['root']);
    expect(afterRoot).toEqual({ trust: 5 });
    expect(getAvailableInteractions(story, 'root', ['root'], null, [], afterRoot)).toContainEqual(
      story.interactions[1],
    );
    expect(getJourneyStatValues(story, ['root', 'middle'])).toEqual({ trust: 10 });
  });

  it('applies positive and negative hourly changes before explicit interaction effects', () => {
    const story = storyFixture();
    story.characters = [
      {
        id: 'mira',
        name: 'Mira',
        description: '',
        stats: [
          { id: 'energy', statDefinitionId: 'energy-definition', initialValue: 10 },
          { id: 'trust', statDefinitionId: 'trust-definition', initialValue: 2 },
        ],
      },
    ];
    story.statDefinitions = [
      { id: 'energy-definition', name: 'Energy', changePerHour: -2 },
      { id: 'trust-definition', name: 'Trust', changePerHour: 1 },
    ];
    story.interactions[0].durationMinutes = 90;
    story.interactions[0].statEffects = [{ statId: 'energy', operation: 'add', value: 1 }];

    expect(getJourneyStatValues(story, ['root'])).toEqual({ energy: 8, trust: 3.5 });
    expect(getJourneyStatValues(story, ['root', 'root'])).toEqual({ energy: 6, trust: 5 });
  });
});

describe('story time', () => {
  it('advances time for every interaction visit and across calendar boundaries', () => {
    const story = storyFixture();
    story.startDateTime = '2026-07-26T23:50';
    story.interactions[0].durationMinutes = 15;
    story.interactions[1].durationMinutes = 30;

    expect(addStoryMinutes('2024-02-28T23:50', 20)).toBe('2024-02-29T00:10');
    expect(getJourneyDateTime(story, ['root', 'middle', 'root'])).toBe('2026-07-27T00:50');
  });

  it('matches several dates, weekdays, and time slots with overnight support', () => {
    const story = storyFixture();
    story.interactions[1].triggers[0].conditions = [
      {
        temporal: {
          dateRanges: [{ startDate: '2026-07-27', endDate: '2026-07-31' }],
          weekdays: ['monday', 'tuesday'],
          timeSlots: [
            { startTime: '09:00', endTime: '12:00' },
            { startTime: '22:00', endTime: '02:00' },
          ],
        },
      },
    ];

    expect(
      getAvailableInteractions(story, 'root', ['root'], null, [], {}, '2026-07-27T10:30'),
    ).toContainEqual(story.interactions[1]);
    expect(
      getAvailableInteractions(story, 'root', ['root'], null, [], {}, '2026-07-28T23:30'),
    ).toContainEqual(story.interactions[1]);
    expect(
      getAvailableInteractions(story, 'root', ['root'], null, [], {}, '2026-07-29T10:30'),
    ).not.toContainEqual(story.interactions[1]);
    expect(
      getAvailableInteractions(story, 'root', ['root'], null, [], {}, '2026-07-27T12:00'),
    ).not.toContainEqual(story.interactions[1]);
  });

  it('treats exact dates and date ranges as alternatives', () => {
    const story = storyFixture();
    story.interactions[1].triggers[0].conditions = [
      {
        temporal: {
          dates: ['2026-08-15'],
          dateRanges: [{ startDate: '2026-09-01', endDate: '2026-09-03' }],
        },
      },
    ];

    expect(
      getAvailableInteractions(story, 'root', ['root'], null, [], {}, '2026-08-15T08:00'),
    ).toContainEqual(story.interactions[1]);
    expect(
      getAvailableInteractions(story, 'root', ['root'], null, [], {}, '2026-09-02T08:00'),
    ).toContainEqual(story.interactions[1]);
  });
});

describe('reader progress', () => {
  it('materializes replayable state while keeping repeated journey visits', () => {
    const story = storyFixture();
    story.startDateTime = '2026-07-27T09:00';
    story.interactions[0].durationMinutes = 15;
    story.interactions[0].locationId = 'harbor';
    story.characters = [
      {
        id: 'mira',
        name: 'Mira',
        description: '',
        stats: [{ id: 'trust', statDefinitionId: 'trust-definition', initialValue: 1 }],
        items: [{ id: 'key-1', itemDefinitionId: 'key-definition' }],
      },
    ];
    story.interactions[0].statEffects = [{ statId: 'trust', operation: 'add', value: 2 }];
    story.interactions[0].itemEffects = [{ itemId: 'key-1', operation: 'obtain' }];
    story.statDefinitions = [
      { id: 'trust-definition', name: 'Trust', changePerHour: 0 },
      { id: 'durability-definition', name: 'Durability', changePerHour: -2 },
    ];
    story.itemDefinitions = [
      {
        id: 'key-definition',
        name: 'Key',
        description: '',
        stats: [{ statDefinitionId: 'durability-definition', initialValue: 10 }],
      },
    ];
    story.interactions[0].itemStatEffects = [
      {
        itemId: 'key-1',
        statDefinitionId: 'durability-definition',
        operation: 'add',
        value: 3,
      },
    ];

    expect(buildReaderProgressState(story, ['root', 'middle', 'root'], ['key-1'])).toEqual({
      version: 1,
      journeyInteractionIds: ['root', 'middle', 'root'],
      currentInteractionId: 'root',
      visitedInteractionIds: ['root', 'middle'],
      currentDateTime: '2026-07-27T09:30',
      currentLocationId: 'harbor',
      statValues: { trust: 5 },
      ownedItemIds: ['key-1'],
      itemStatValues: { 'key-1': { 'durability-definition': 15 } },
    });
  });

  it('reconciles deleted interactions, unknown items, and duplicate items', () => {
    const story = storyFixture();
    story.characters = [
      {
        id: 'mira',
        name: 'Mira',
        description: '',
        items: [{ id: 'key-1', itemDefinitionId: 'key-definition' }],
      },
    ];
    story.interactions[0].itemEffects = [{ itemId: 'key-1', operation: 'obtain' }];

    expect(
      buildReaderProgressState(story, ['root', 'deleted', 'middle'], ['key-1', 'unknown', 'key-1']),
    ).toMatchObject({
      journeyInteractionIds: ['root', 'middle'],
      currentInteractionId: 'middle',
      visitedInteractionIds: ['root', 'middle'],
      ownedItemIds: ['key-1'],
    });
  });

  it('obtains and loses distinct item instances deterministically', () => {
    const story = storyFixture();
    story.characters = [
      {
        id: 'mira',
        name: 'Mira',
        description: '',
        items: [
          { id: 'key-1', itemDefinitionId: 'key-definition' },
          { id: 'key-2', itemDefinitionId: 'key-definition' },
        ],
      },
    ];
    story.interactions[0].itemEffects = [
      { itemId: 'key-1', operation: 'obtain' },
      { itemId: 'key-2', operation: 'obtain' },
    ];
    story.interactions[1].itemEffects = [{ itemId: 'key-1', operation: 'lose' }];

    expect(buildReaderProgressState(story, ['root', 'root', 'middle']).ownedItemIds).toEqual([
      'key-2',
    ]);
  });

  it('resolves character-rooted item trees and ignores disconnected instances', () => {
    const story = storyFixture();
    story.characters = [
      {
        id: 'mira',
        name: 'Mira',
        description: '',
        items: [
          { id: 'backpack-1', itemDefinitionId: 'backpack-definition' },
          {
            id: 'key-1',
            itemDefinitionId: 'key-definition',
            parentItemId: 'backpack-1',
            relationshipType: 'contained',
          },
          {
            id: 'charm-1',
            itemDefinitionId: 'charm-definition',
            parentItemId: 'key-1',
            relationshipType: 'attached',
          },
          {
            id: 'orphan-1',
            itemDefinitionId: 'orphan-definition',
            parentItemId: 'missing-parent',
            relationshipType: 'contained',
          },
        ],
      },
    ];
    story.itemDefinitions = [
      {
        id: 'backpack-definition',
        name: 'Backpack',
        description: '',
        stats: [{ statDefinitionId: 'durability-definition', initialValue: 20 }],
      },
      {
        id: 'key-definition',
        name: 'Key',
        description: '',
        stats: [{ statDefinitionId: 'durability-definition', initialValue: 10 }],
      },
      {
        id: 'charm-definition',
        name: 'Charm',
        description: '',
        stats: [{ statDefinitionId: 'durability-definition', initialValue: 5 }],
      },
      {
        id: 'orphan-definition',
        name: 'Orphan',
        description: '',
        stats: [{ statDefinitionId: 'durability-definition', initialValue: 1 }],
      },
    ];
    story.interactions[0].itemEffects = [{ itemId: 'key-1', operation: 'obtain' }];

    const progress = buildReaderProgressState(story, ['root']);

    expect(getItemDefinitionIdForInstance(story, 'key-1')).toBe('key-definition');
    expect(getItemDefinitionIdForInstance(story, 'charm-1')).toBe('charm-definition');
    expect(getItemDefinitionIdForInstance(story, 'orphan-1')).toBeUndefined();
    expect(getItemOwnerIdForInstance(story, 'key-1')).toBe('mira');
    expect(getItemOwnerIdForInstance(story, 'charm-1')).toBe('mira');
    expect(getItemOwnerIdForInstance(story, 'orphan-1')).toBeUndefined();
    expect(progress.ownedItemIds).toEqual(['key-1']);
    expect(progress.itemStatValues).toEqual({
      'backpack-1': { 'durability-definition': 20 },
      'key-1': { 'durability-definition': 10 },
      'charm-1': { 'durability-definition': 5 },
    });
  });

  it('resolves location-rooted item trees during replay', () => {
    const story = storyFixture();
    story.locations = [
      {
        id: 'home',
        name: 'Home',
        description: '',
        items: [
          { id: 'cabinet-1', itemDefinitionId: 'cabinet-definition' },
          {
            id: 'supply-1',
            itemDefinitionId: 'supply-definition',
            parentItemId: 'cabinet-1',
            relationshipType: 'contained',
          },
        ],
      },
    ];
    story.itemDefinitions = [
      { id: 'cabinet-definition', name: 'Cabinet', description: '' },
      {
        id: 'supply-definition',
        name: 'Supply',
        description: '',
        stats: [{ statDefinitionId: 'durability-definition', initialValue: 10 }],
      },
    ];
    story.interactions[0].itemEffects = [{ itemId: 'supply-1', operation: 'obtain' }];

    const progress = buildReaderProgressState(story, ['root']);

    expect(getItemDefinitionIdForInstance(story, 'supply-1')).toBe('supply-definition');
    expect(getItemOwnerIdForInstance(story, 'supply-1')).toBe('home');
    expect(progress.ownedItemIds).toEqual(['supply-1']);
    expect(progress.itemStatValues['supply-1']).toEqual({ 'durability-definition': 10 });
  });

  it('obtains reusable item definitions and evaluates item ownership conditions', () => {
    const story = storyFixture();
    story.itemDefinitions = [
      { id: 'key-definition', name: 'Key', description: '' },
      { id: 'map-definition', name: 'Map', description: '' },
    ];
    story.characters = [{ id: 'mira', name: 'Mira', description: '' }];
    story.interactions[0].itemEffects = [
      { itemDefinitionId: 'key-definition', characterId: 'mira', operation: 'obtain' },
    ];
    story.interactions[1].itemEffects = [
      { itemDefinitionId: 'key-definition', characterId: 'mira', operation: 'obtain' },
    ];
    story.interactions[2].triggers[0].conditions = [
      { itemDefinitionId: 'key-definition', isOwned: true },
      { itemDefinitionId: 'map-definition', isOwned: false },
    ];

    const progress = buildReaderProgressState(story, ['root', 'middle']);
    expect(progress.ownedItemIds).toHaveLength(2);
    expect(new Set(progress.ownedItemIds).size).toBe(2);
    expect(getItemOwnerIdForInstance(story, progress.ownedItemIds[0])).toBe('mira');
    expect(
      getAvailableInteractions(
        story,
        'middle',
        ['root', 'middle'],
        null,
        [],
        {},
        story.startDateTime,
        ['key-definition', 'key-definition'],
      ).map(({ id }) => id),
    ).toContain('end');
    expect(
      getTriggerConditionFailures(
        story.interactions[2],
        'middle',
        ['root', 'middle'],
        null,
        [],
        {},
        story.startDateTime,
        [],
      ),
    ).toHaveLength(1);
  });

  it('keeps independent runtime stat values for instances of one item definition', () => {
    const story = storyFixture();
    story.statDefinitions = [{ id: 'durability', name: 'Durability' }];
    story.itemDefinitions = [
      {
        id: 'key-definition',
        name: 'Key',
        description: '',
        stats: [{ statDefinitionId: 'durability', initialValue: 10 }],
      },
    ];
    story.characters = [
      {
        id: 'mira',
        name: 'Mira',
        description: '',
        items: [
          { id: 'key-1', itemDefinitionId: 'key-definition' },
          { id: 'key-2', itemDefinitionId: 'key-definition' },
        ],
      },
    ];
    story.interactions[0].itemStatEffects = [
      {
        itemId: 'key-1',
        statDefinitionId: 'durability',
        operation: 'add',
        value: -4,
      },
      {
        itemId: 'key-2',
        statDefinitionId: 'durability',
        operation: 'set',
        value: 3,
      },
    ];

    expect(buildReaderProgressState(story, ['root']).itemStatValues).toEqual({
      'key-1': { durability: 6 },
      'key-2': { durability: 3 },
    });
  });
});
