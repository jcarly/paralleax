import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getTriggerConditions, type Story } from '@paralleax/shared';
import {
  buildStatCondition,
  createStatAssignment,
  createStatDefinition,
  deleteStatAssignment,
  deleteStatDefinition,
  findStatAssignment,
  findStatDefinition,
  getStatAssignments,
  updateStatAssignment,
  updateStatDefinition,
  validateStatEffects,
} from './story-stats';

function storyFixture(): Story {
  return {
    id: 'story-1',
    title: 'Story',
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
    characters: [{ id: 'mira', name: 'Mira', description: '', stats: [], items: [] }],
    locations: [{ id: 'harbor', name: 'Harbor', description: '', stats: [], items: [] }],
    itemDefinitions: [{ id: 'key-definition', name: 'Key', description: '', stats: [] }],
    interactions: [
      {
        id: 'root',
        title: 'Root',
        body: '',
        position: { x: 0, y: 0 },
        statEffects: [],
        triggers: [{ id: 'root-trigger', inputInteractionIds: [], conditions: [] }],
      },
    ],
  };
}

describe('story stats application rules', () => {
  it('creates and updates typed definitions without exposing a source key', () => {
    const story = storyFixture();
    const definition = createStatDefinition(story, 'mood-definition', {
      name: '  Mood  ',
      valueType: 'string',
      category: '  State  ',
      imageUrl: '  https://images.example/mood.svg  ',
    });

    expect(definition).toEqual({
      id: 'mood-definition',
      name: 'Mood',
      valueType: 'string',
      category: 'State',
      imageUrl: 'https://images.example/mood.svg',
    });
    expect(definition).not.toHaveProperty('key');
    expect(() =>
      createStatDefinition(story, 'open-definition', {
        name: 'Open',
        valueType: 'boolean',
        changePerHour: 1,
      }),
    ).toThrow(BadRequestException);

    expect(
      updateStatDefinition(story, definition.id, {
        name: '  Current mood  ',
        category: '  Runtime  ',
        imageUrl: '  https://images.example/current-mood.svg  ',
      }),
    ).toMatchObject({
      name: 'Current mood',
      category: 'Runtime',
      imageUrl: 'https://images.example/current-mood.svg',
    });
    updateStatDefinition(story, definition.id, { category: '', imageUrl: '', changePerHour: 0 });
    expect(definition).not.toHaveProperty('category');
    expect(definition).not.toHaveProperty('imageUrl');
    expect(definition).not.toHaveProperty('changePerHour');
    expect(() => updateStatDefinition(story, definition.id, { name: ' ' })).toThrow(
      BadRequestException,
    );
    expect(() => updateStatDefinition(story, definition.id, { changePerHour: 1 })).toThrow(
      BadRequestException,
    );
    expect(findStatDefinition(story, definition.id)).toBe(definition);
    expect(() => findStatDefinition(story, 'missing-definition')).toThrow(NotFoundException);
  });

  it('shares assignments across every owner and removes their narrative references', () => {
    const story = storyFixture();
    const definition = createStatDefinition(story, 'score-definition', {
      name: 'Score',
      valueType: 'number',
      changePerHour: 2,
    });
    const storyStat = createStatAssignment(story, 'story-score', {
      statDefinitionId: definition.id,
      ownerType: 'story',
      initialValue: 1,
    });
    const characterStat = createStatAssignment(story, 'mira-score', {
      statDefinitionId: definition.id,
      ownerType: 'character',
      ownerId: 'mira',
      initialValue: 2,
    });
    const locationStat = createStatAssignment(story, 'harbor-score', {
      statDefinitionId: definition.id,
      ownerType: 'location',
      ownerId: 'harbor',
      initialValue: 3,
    });
    const itemStat = createStatAssignment(story, 'key-score', {
      statDefinitionId: definition.id,
      ownerType: 'itemDefinition',
      ownerId: 'key-definition',
      initialValue: 4,
    });

    expect(getStatAssignments(story)).toEqual([
      { assignment: storyStat, ownerType: 'story' },
      { assignment: characterStat, ownerType: 'character', ownerId: 'mira' },
      { assignment: locationStat, ownerType: 'location', ownerId: 'harbor' },
      { assignment: itemStat, ownerType: 'itemDefinition', ownerId: 'key-definition' },
    ]);
    expect(updateStatAssignment(story, characterStat.id, 5).initialValue).toBe(5);
    expect(findStatAssignment(story, characterStat.id).assignment).toBe(characterStat);
    expect(() =>
      createStatAssignment(story, 'duplicate-score', {
        statDefinitionId: definition.id,
        ownerType: 'story',
        initialValue: 6,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      createStatAssignment(story, 'invalid-story-score', {
        statDefinitionId: definition.id,
        ownerType: 'story',
        ownerId: 'story-1',
        initialValue: 1,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      createStatAssignment(story, 'unowned-score', {
        statDefinitionId: definition.id,
        ownerType: 'character',
        initialValue: 1,
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      createStatAssignment(story, 'foreign-score', {
        statDefinitionId: definition.id,
        ownerType: 'location',
        ownerId: 'missing-location',
        initialValue: 1,
      }),
    ).toThrow(BadRequestException);
    expect(() => updateStatAssignment(story, characterStat.id, false)).toThrow(BadRequestException);

    story.interactions[0].statEffects = [
      { statId: storyStat.id, operation: 'add', value: 1 },
      { statId: characterStat.id, operation: 'add', value: 1 },
      { statId: locationStat.id, operation: 'set', value: 0 },
    ];
    story.interactions[0].triggers[0].conditions = [
      { statId: storyStat.id, operator: 'gte', value: 1 },
      { statId: itemStat.id, itemId: 'key-1', operator: 'gte', value: 1 },
    ];

    deleteStatAssignment(story, storyStat.id);
    expect(story.stats).toEqual([]);
    expect(story.interactions[0].statEffects).toHaveLength(2);
    expect(getTriggerConditions(story.interactions[0].triggers[0])).toHaveLength(1);

    deleteStatDefinition(story, definition.id);
    expect(story.statDefinitions).toEqual([]);
    expect(story.characters?.[0].stats).toEqual([]);
    expect(story.locations?.[0].stats).toEqual([]);
    expect(story.itemDefinitions?.[0].stats).toEqual([]);
    expect(story.interactions[0].statEffects).toEqual([]);
    expect(getTriggerConditions(story.interactions[0].triggers[0])).toEqual([]);
    expect(() => findStatAssignment(story, characterStat.id)).toThrow(NotFoundException);
    expect(() => deleteStatDefinition(story, definition.id)).toThrow(NotFoundException);
  });

  it('validates typed effects, comparisons, and exact item targets', () => {
    const story = storyFixture();
    story.itemDefinitions?.push({ id: 'map-definition', name: 'Map', description: '', stats: [] });
    story.characters![0].items = [
      { id: 'key-1', itemDefinitionId: 'key-definition' },
      { id: 'map-1', itemDefinitionId: 'map-definition' },
    ];
    const moodDefinition = createStatDefinition(story, 'mood-definition', {
      name: 'Mood',
      valueType: 'string',
    });
    const durabilityDefinition = createStatDefinition(story, 'durability-definition', {
      name: 'Durability',
      valueType: 'number',
    });
    const mood = createStatAssignment(story, 'mood', {
      statDefinitionId: moodDefinition.id,
      ownerType: 'story',
      initialValue: 'calm',
    });
    const durability = createStatAssignment(story, 'key-durability', {
      statDefinitionId: durabilityDefinition.id,
      ownerType: 'itemDefinition',
      ownerId: 'key-definition',
      initialValue: 10,
    });

    expect(
      validateStatEffects(story, [
        { statId: mood.id, operation: 'set', value: 'alert' },
        { statId: durability.id, itemId: 'key-1', operation: 'add', value: -1 },
      ]),
    ).toEqual([
      { statId: mood.id, operation: 'set', value: 'alert' },
      { statId: durability.id, itemId: 'key-1', operation: 'add', value: -1 },
    ]);
    expect(() =>
      validateStatEffects(story, [
        { statId: durability.id, itemId: 'key-1', operation: 'add', value: -1 },
        { statId: durability.id, itemId: 'key-1', operation: 'set', value: 4 },
      ]),
    ).toThrow(BadRequestException);
    expect(() =>
      validateStatEffects(story, [{ statId: mood.id, operation: 'add', value: 'alert' }]),
    ).toThrow(BadRequestException);
    expect(() =>
      validateStatEffects(story, [
        { statId: mood.id, itemId: 'key-1', operation: 'set', value: 'alert' },
      ]),
    ).toThrow(BadRequestException);
    expect(() =>
      validateStatEffects(story, [{ statId: durability.id, operation: 'set', value: 4 }]),
    ).toThrow(BadRequestException);
    expect(() =>
      validateStatEffects(story, [
        { statId: durability.id, itemId: 'map-1', operation: 'set', value: 4 },
      ]),
    ).toThrow(BadRequestException);
    expect(() =>
      validateStatEffects(story, [{ statId: 'missing-stat', operation: 'set', value: 1 }]),
    ).toThrow(BadRequestException);

    expect(
      buildStatCondition(story, { statId: mood.id, operator: 'neq', value: 'unknown' }),
    ).toEqual({ statId: mood.id, operator: 'neq', value: 'unknown' });
    expect(
      buildStatCondition(story, {
        statId: durability.id,
        itemId: 'key-1',
        operator: 'gte',
        value: 5,
      }),
    ).toEqual({
      statId: durability.id,
      itemId: 'key-1',
      operator: 'gte',
      value: 5,
    });
    expect(() =>
      buildStatCondition(story, { statId: mood.id, operator: 'gt', value: 'calm' }),
    ).toThrow(BadRequestException);
  });
});
