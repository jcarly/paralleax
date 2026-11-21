import 'reflect-metadata';
import * as request from 'supertest';
import { NATIVE_STORY_FILE_LIMIT } from './application/native-story-import';
import type { NativeStoryImportRequest } from './application/native-story-import.port';
import { parseResponse } from './test/api-json';
import { startStoriesApi, type StoriesApi } from './test/stories-api';

const repository = {
  createNativeStory: jest.fn(async (input: NativeStoryImportRequest) => input.prepare({})),
};
let api: StoriesApi;
beforeAll(async () => {
  api = await startStoriesApi({ storiesRepository: repository });
});
beforeEach(() => jest.clearAllMocks());
afterAll(async () => api.close());

function file(interactions = 1) {
  return {
    format: 'paralleax.story',
    version: 1,
    story: {
      title: 'Story',
      interactions: Array.from({ length: interactions }, (_, index) => ({
        id: `scene-${index}`,
        title: '',
        body: 'x'.repeat(50_000),
        position: { x: index, y: 0 },
        triggers: [],
      })),
    },
  };
}

function upload(path: string, value: Buffer) {
  return request(api.httpServer)
    .post(path)
    .set('Content-Type', 'application/octet-stream')
    .send(value);
}

it('previews a valid file larger than the ordinary JSON request limit without writes', async () => {
  const response = await upload(
    '/api/stories/imports/native/preview',
    Buffer.from(JSON.stringify(file(3))),
  ).expect(200);
  expect(parseResponse(response)).toMatchObject({ title: 'Story', interactionCount: 3 });
  expect(repository.createNativeStory).not.toHaveBeenCalled();
});

it('creates a Story as the authenticated user after validating the file again', async () => {
  const response = await upload(
    '/api/stories/imports/native',
    Buffer.from(JSON.stringify(file())),
  ).expect(201);
  expect(parseResponse(response)).toMatchObject({ title: 'Story', interactionCount: 1 });
  expect(repository.createNativeStory).toHaveBeenCalledWith(
    expect.objectContaining({ ownerId: 'test-user' }),
  );
});

it('rejects malformed and unsupported files without writes', async () => {
  const invalid = await upload('/api/stories/imports/native', Buffer.from('{')).expect(400);
  expect(parseResponse(invalid)).toMatchObject({ code: 'INVALID_STRUCTURE' });
  const version = await upload(
    '/api/stories/imports/native/preview',
    Buffer.from(JSON.stringify({ ...file(), version: 2 })),
  ).expect(400);
  expect(parseResponse(version)).toMatchObject({ code: 'UNSUPPORTED_VERSION' });
  await request(api.httpServer).post('/api/stories/imports/native/preview').send({}).expect(415);
  await upload('/api/stories/imports/native/preview', Buffer.from(JSON.stringify(file())))
    .set('Cookie', 'paralleax_session=anonymous')
    .expect(401);
  expect(repository.createNativeStory).not.toHaveBeenCalled();
});

it('rejects a file beyond the dedicated upload limit', async () => {
  await upload(
    '/api/stories/imports/native/preview',
    Buffer.alloc(NATIVE_STORY_FILE_LIMIT + 1, 32),
  ).expect(413);
  expect(repository.createNativeStory).not.toHaveBeenCalled();
}, 30_000);
