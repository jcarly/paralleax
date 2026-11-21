import 'reflect-metadata';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Story } from '@paralleax/shared';
import { StoryGraphService } from './story-graph';
import { StoryMutationService } from './story-mutations';

let moduleRef: TestingModule;
let graph: StoryGraphService;

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    providers: [StoryGraphService, { provide: StoryMutationService, useValue: {} }],
  }).compile();
  graph = moduleRef.get(StoryGraphService);
});
afterAll(async () => moduleRef.close());

function story(): Story {
  return {
    id: 'story',
    title: 'Story',
    createdAt: '',
    updatedAt: '',
    statDefinitions: [{ id: 'definition', name: 'Score', valueType: 'number' }],
    stats: [{ id: 'score', statDefinitionId: 'definition', initialValue: 1 }],
    interactions: [
      {
        id: 'scene',
        title: '',
        body: '',
        position: { x: 0, y: 0 },
        statEffects: [{ statId: 'score', operation: 'add', value: 1 }],
        triggers: [
          {
            id: 'trigger',
            inputInteractionIds: ['scene'],
            conditionGroups: [
              { id: 'group', conditions: [{ interactionId: 'scene', hasBeenVisited: true }] },
            ],
          },
        ],
      },
    ],
  };
}

it('reuses the existing graph rules without mutating the source', () => {
  const source = story();
  const before = structuredClone(source);
  expect(graph.validateNativeInteractionRelations(source, source.interactions[0])).toBeUndefined();
  expect(source).toEqual(before);
});

it('rejects a foreign trigger input and a foreign conditional text reference', () => {
  const source = story();
  source.interactions[0].triggers[0].inputInteractionIds = ['missing'];
  expect(() => graph.validateNativeInteractionRelations(source, source.interactions[0])).toThrow(
    'Trigger references must belong to the same story',
  );
  source.interactions[0].triggers[0].inputInteractionIds = [];
  source.interactions[0].conditionalTextBlocks = [
    { id: 'block', conditions: [{ interactionId: 'missing', hasBeenVisited: true }] },
  ];
  expect(() => graph.validateNativeInteractionRelations(source, source.interactions[0])).toThrow(
    'Condition references must belong to the same story',
  );
});

it('rejects duplicate inputs and invalid stat effects', () => {
  const source = story();
  source.interactions[0].triggers[0].inputInteractionIds = ['scene', 'scene'];
  expect(graph.validateNativeInteractionRelations(source, source.interactions[0])).toBe(
    'Trigger inputs must be unique',
  );
  source.interactions[0].triggers[0].inputInteractionIds = [];
  source.interactions[0].statEffects = [{ statId: 'missing', operation: 'set', value: 1 }];
  expect(() => graph.validateNativeInteractionRelations(source, source.interactions[0])).toThrow();
});
