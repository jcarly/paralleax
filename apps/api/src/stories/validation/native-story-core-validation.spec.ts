import 'reflect-metadata';
import { Test, type TestingModule } from '@nestjs/testing';
import { DEFAULT_STORY_QUOTAS } from '../story-quotas';
import { StoryGraphService } from '../application/story-graph';
import { StoryMutationService } from '../application/story-mutations';
import { validateNativeStoryCore } from './native-story-core-validation';

let moduleRef: TestingModule;
let graph: StoryGraphService;
beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    providers: [StoryGraphService, { provide: StoryMutationService, useValue: {} }],
  }).compile();
  graph = moduleRef.get(StoryGraphService);
});
afterAll(async () => moduleRef.close());

function file() {
  return {
    format: 'paralleax.story',
    version: 1,
    story: {
      title: 'Story',
      statDefinitions: [{ id: 'definition', name: 'Score', valueType: 'number' }],
      stats: [{ id: 'score', statDefinitionId: 'definition', initialValue: 1 }],
      interactions: [
        {
          id: 'scene',
          title: 'Scene',
          body: '',
          position: { x: 0, y: 0 },
          statEffects: [{ statId: 'score', operation: 'add', value: 1 }],
          triggers: [{ id: 'trigger', inputInteractionIds: ['scene'], appearanceProbability: 50 }],
        },
      ],
    },
  };
}

it('performs non-mutating core checks on valid content', () => {
  const input = file();
  const before = structuredClone(input);
  expect(validateNativeStoryCore(input, graph)).toMatchObject({ status: 'core_valid' });
  expect(input).toEqual(before);
});

it('rejects unsafe markup and unresolved rich-text references', () => {
  const input = file();
  input.story.interactions[0].body = '<script>alert(1)</script>';
  expect(validateNativeStoryCore(input, graph)).toMatchObject({
    status: 'invalid',
    code: 'UNSUPPORTED_CONTENT',
    path: '$.story.interactions[0].body',
  });
  input.story.interactions[0].body = '<span data-interaction-link-target="missing">Go</span>';
  expect(validateNativeStoryCore(input, graph)).toMatchObject({
    status: 'invalid',
    code: 'MISSING_REFERENCE',
    path: '$.story.interactions[0].body',
  });
});

it('reports quota and nested DTO errors before graph processing', () => {
  const input = file();
  expect(
    validateNativeStoryCore(input, graph, { ...DEFAULT_STORY_QUOTAS, interactions: 0 }),
  ).toMatchObject({
    status: 'invalid',
    code: 'STORY_QUOTA_EXCEEDED',
    path: '$.story',
  });
  input.story.interactions[0].triggers[0].appearanceProbability = 101;
  expect(validateNativeStoryCore(input, graph)).toMatchObject({
    status: 'invalid',
    code: 'INVALID_CONTENT',
    path: '$.story.interactions[0].triggers[0].appearanceProbability',
  });
});

it('rejects missing stat and trigger references', () => {
  const input = file();
  input.story.stats[0].statDefinitionId = 'missing';
  expect(validateNativeStoryCore(input, graph)).toMatchObject({
    status: 'invalid',
    code: 'INVALID_STATS',
    path: '$.story.stats[0]',
  });
  input.story.stats[0].statDefinitionId = 'definition';
  input.story.interactions[0].triggers[0].inputInteractionIds = ['missing'];
  expect(validateNativeStoryCore(input, graph)).toMatchObject({
    status: 'invalid',
    code: 'INVALID_GRAPH',
    path: '$.story.interactions[0]',
  });
});
