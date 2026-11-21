import 'reflect-metadata';
import { Test, type TestingModule } from '@nestjs/testing';
import { StoryGraphService } from './story-graph';
import { StoryMutationService } from './story-mutations';
import {
  NATIVE_STORY_IMPORT_PORT,
  type NativeStoryImportRequest,
} from './native-story-import.port';
import { NativeStoryImportError, NativeStoryImportService } from './native-story-import';

const repository = {
  createNativeStory: jest.fn(async (request: NativeStoryImportRequest) =>
    request.prepare({
      interaction: new Map([['scene', 'new-scene']]),
      trigger: new Map([['trigger', 'new-trigger']]),
    }),
  ),
};
let moduleRef: TestingModule;
let service: NativeStoryImportService;
beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    providers: [
      NativeStoryImportService,
      StoryGraphService,
      { provide: NATIVE_STORY_IMPORT_PORT, useValue: repository },
      { provide: StoryMutationService, useValue: {} },
    ],
  }).compile();
  service = moduleRef.get(NativeStoryImportService);
});
beforeEach(() => jest.clearAllMocks());
afterAll(async () => moduleRef.close());

function file(): object {
  return {
    format: 'paralleax.story',
    version: 1,
    story: {
      title: 'Story',
      interactions: [
        {
          id: 'scene',
          title: '',
          position: { x: 0, y: 0 },
          body: '<span data-interaction-link-target="scene">Go</span>',
          triggers: [{ id: 'trigger', inputInteractionIds: ['scene'] }],
        },
      ],
    },
  };
}

function bytes(value: object): Buffer {
  return Buffer.from(JSON.stringify(value), 'utf8');
}

it('previews validated content without persistence', () => {
  expect(service.preview(bytes(file()))).toMatchObject({
    title: 'Story',
    interactionCount: 1,
    triggerCount: 1,
  });
  expect(repository.createNativeStory).not.toHaveBeenCalled();
});

it('creates with the authenticated owner and revalidates mapped references', async () => {
  const result = await service.create(bytes(file()), 'owner');
  expect(result).toMatchObject({ title: 'Story', interactionCount: 1 });
  expect(repository.createNativeStory).toHaveBeenCalledWith(
    expect.objectContaining({ ownerId: 'owner', storyId: result.id }),
  );
  const request = repository.createNativeStory.mock.calls[0][0];
  const mapped = request.prepare({
    interaction: new Map([['scene', 'new-scene']]),
    trigger: new Map([['trigger', 'new-trigger']]),
  });
  expect(mapped.interactions[0]).toMatchObject({
    id: 'new-scene',
    triggers: [
      { id: 'new-trigger', probabilityKey: 'trigger', inputInteractionIds: ['new-scene'] },
    ],
  });
  expect(mapped.interactions[0].body).toContain('data-interaction-link-target="new-scene"');
});

it('rejects invalid versions and unsafe data before persistence', async () => {
  await expect(service.create(bytes({ ...file(), version: 2 }), 'owner')).rejects.toMatchObject({
    code: 'UNSUPPORTED_VERSION',
  });
  await expect(service.create(Buffer.from('{'), 'owner')).rejects.toBeInstanceOf(
    NativeStoryImportError,
  );
  await expect(
    service.create(bytes({ ...file(), owner: 'forged' }), 'owner'),
  ).rejects.toMatchObject({ code: 'INVALID_STRUCTURE' });
  expect(repository.createNativeStory).not.toHaveBeenCalled();
});

it('reports a concurrent identifier collision without exposing database details', async () => {
  repository.createNativeStory.mockRejectedValueOnce(
    Object.assign(new Error('private database detail'), { code: '23505' }),
  );
  await expect(service.create(bytes(file()), 'owner')).rejects.toMatchObject({
    code: 'ID_COLLISION',
    message: 'A Story identifier became unavailable during import. Try again.',
  });
});
