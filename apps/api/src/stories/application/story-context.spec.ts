import { getTriggerConditions, type Story } from '@paralleax/shared';
import { Test, type TestingModule } from '@nestjs/testing';
import { StoryMutationService } from './story-mutations';
import { StoryContextService } from './story-context';

const mutations = { update: jest.fn() };
let moduleRef: TestingModule;
let service: StoryContextService;
let lastStory: Story;

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    providers: [StoryContextService, { provide: StoryMutationService, useValue: mutations }],
  }).compile();
  service = moduleRef.get(StoryContextService);
});

afterAll(async () => {
  await moduleRef.close();
});

beforeEach(() => {
  jest.clearAllMocks();
  mutations.update.mockImplementation(async (_storyId: string, mutation: (story: Story) => Story) =>
    runFixtureMutation(mutation),
  );
});

function runFixtureMutation(mutation: (story: Story) => Story, story = storyFixture()): Story {
  lastStory = mutation(story);
  lastStory.revision = 4;
  lastStory.updatedAt = '2026-08-25T16:00:00.000Z';
  return lastStory;
}

it('creates normalized locations and returns compact mutation metadata', async () => {
  const result = await service.createLocation(
    'story-1',
    {
      name: '  Workshop  ',
      description: 'Repairs happen here.',
      category: '  Interior  ',
      imageUrl: '  https://images.example/workshop.svg  ',
    },
    'user-1',
  );

  expect(result).toMatchObject({
    location: {
      name: 'Workshop',
      description: 'Repairs happen here.',
      category: 'Interior',
      imageUrl: 'https://images.example/workshop.svg',
    },
    revision: 4,
    updatedAt: '2026-08-25T16:00:00.000Z',
  });
  expect(result).not.toHaveProperty('locations');
});

it('keeps a single playable character when updating the context', async () => {
  const result = await service.updateCharacter('story-1', 'ira', { isPlayable: true }, 'user-1');

  expect(result.character).toMatchObject({ id: 'ira', isPlayable: true });
  expect(lastStory.characters).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'mira', isPlayable: false }),
      expect.objectContaining({ id: 'ira', isPlayable: true }),
    ]),
  );
});

it('reuses stat definitions when creating an item definition', async () => {
  const result = await service.createItemDefinition(
    'story-1',
    {
      name: '  Battery  ',
      stats: [{ statDefinitionId: 'energy-definition', initialValue: 8 }],
    },
    'user-1',
  );

  expect(result.itemDefinition).toMatchObject({
    name: 'Battery',
    stats: [
      {
        statDefinitionId: 'energy-definition',
        initialValue: 8,
      },
    ],
  });
  expect(result.itemDefinition.stats?.[0].id).toEqual(expect.any(String));

  await expect(
    service.createItemDefinition(
      'story-1',
      {
        name: 'Foreign item',
        stats: [{ statDefinitionId: 'foreign-definition', initialValue: 1 }],
      },
      'user-1',
    ),
  ).rejects.toThrow('Item stats must belong to the same story');
});

it('protects item containers and cleans references when deleting a leaf item', async () => {
  await expect(service.deleteCharacterItem('story-1', 'mira', 'bag', 'user-1')).rejects.toThrow(
    'Move or remove contained items before deleting a container',
  );

  const deleted = await service.deleteCharacterItem('story-1', 'mira', 'key', 'user-1');

  expect(deleted).toEqual({
    characterId: 'mira',
    itemId: 'key',
    revision: 4,
    updatedAt: '2026-08-25T16:00:00.000Z',
  });
  expect(lastStory.characters?.[0].items).toEqual([
    { id: 'bag', itemDefinitionId: 'bag-definition' },
  ]);
  expect(lastStory.interactions[0].itemEffects).toEqual([]);
  expect(lastStory.interactions[0].statEffects).toEqual([]);
  expect(getTriggerConditions(lastStory.interactions[0].triggers[0])).toEqual([]);
});

it('returns compact metadata after deleting a character stat and cleans its references', async () => {
  mutations.update.mockImplementationOnce(
    async (_storyId: string, mutation: (story: Story) => Story) =>
      runFixtureMutation(mutation, fixtureWithCharacterStatReferences()),
  );
  const deleted = await service.deleteCharacterStat('story-1', 'mira', 'mira-energy', 'user-1');

  expect(deleted).toEqual({
    characterId: 'mira',
    statId: 'mira-energy',
    revision: 4,
    updatedAt: '2026-08-25T16:00:00.000Z',
  });
  expect(lastStory.characters?.[0].stats).toEqual([]);
  expect(lastStory.interactions[0].statEffects).not.toContainEqual(
    expect.objectContaining({ statId: 'mira-energy' }),
  );
  expect(getTriggerConditions(lastStory.interactions[0].triggers[0])).not.toContainEqual(
    expect.objectContaining({ statId: 'mira-energy' }),
  );
});

function storyLocationFixtures(): NonNullable<Story['locations']> {
  return [{ id: 'harbor', name: 'Harbor', description: '', stats: [], items: [] }];
}

function storyCharacterFixtures(): NonNullable<Story['characters']> {
  return [
    {
      id: 'mira',
      name: 'Mira',
      description: '',
      isPlayable: true,
      stats: [],
      items: [
        { id: 'bag', itemDefinitionId: 'bag-definition' },
        {
          id: 'key',
          itemDefinitionId: 'key-definition',
          parentItemId: 'bag',
          relationshipType: 'contained',
        },
      ],
    },
    {
      id: 'ira',
      name: 'Ira',
      description: '',
      isPlayable: false,
      stats: [],
      items: [],
    },
  ];
}

function itemDefinitionFixtures(): NonNullable<Story['itemDefinitions']> {
  return [
    { id: 'bag-definition', name: 'Bag', description: '', stats: [] },
    {
      id: 'key-definition',
      name: 'Key',
      description: '',
      stats: [{ id: 'key-energy', statDefinitionId: 'energy-definition', initialValue: 1 }],
    },
  ];
}

function rootInteractionFixture(): Story['interactions'][number] {
  return {
    id: 'root',
    title: 'Root',
    body: '',
    position: { x: 0, y: 0 },
    itemEffects: [{ itemId: 'key', operation: 'lose' }],
    statEffects: [{ statId: 'key-energy', itemId: 'key', operation: 'add', value: 1 }],
    triggers: [
      {
        id: 'root-trigger',
        inputInteractionIds: [],
        conditions: [
          { statId: 'key-energy', itemId: 'key', operator: 'gte', value: 1 },
          {
            statId: 'story-energy',
            operator: 'gte',
            comparisonStatId: 'key-energy',
            comparisonItemId: 'key',
          },
        ],
      },
    ],
  };
}

function storyFixture(): Story {
  return {
    id: 'story-1',
    revision: 3,
    title: 'Story',
    createdAt: '2026-08-25T08:00:00.000Z',
    updatedAt: '2026-08-25T08:00:00.000Z',
    locations: storyLocationFixtures(),
    characters: storyCharacterFixtures(),
    statDefinitions: [{ id: 'energy-definition', name: 'Energy', valueType: 'number' }],
    stats: [{ id: 'story-energy', statDefinitionId: 'energy-definition', initialValue: 1 }],
    itemDefinitions: itemDefinitionFixtures(),
    interactions: [rootInteractionFixture()],
  };
}

function fixtureWithCharacterStatReferences(): Story {
  const story = storyFixture();
  const character = story.characters?.find(({ id }) => id === 'mira');
  if (!character) {
    throw new Error('The fixture character is missing.');
  }
  character.stats = [{ id: 'mira-energy', statDefinitionId: 'energy-definition', initialValue: 2 }];
  const root = story.interactions[0];
  root.statEffects ??= [];
  root.statEffects.push({ statId: 'mira-energy', operation: 'add', value: 1 });
  const trigger = root.triggers[0];
  trigger.conditions ??= [];
  trigger.conditions.push({ statId: 'mira-energy', operator: 'gte', value: 1 });
  return story;
}
