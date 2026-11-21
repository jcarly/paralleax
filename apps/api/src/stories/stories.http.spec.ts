import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { MAX_INTERACTION_BODY_LENGTH, STORY_LIST_PAGE_SIZE, type Story } from '@paralleax/shared';
import { STORY_MUTATION_RATE_LIMIT } from './stories.controller';
import { parseResponse } from './test/api-json';
import {
  apiRequests,
  startStoriesApi,
  type ApiHttpServer,
  type StoriesApi,
} from './test/stories-api';

// HTTP boundary contract: validation, body limits, rate limiting and error
// mapping. These requests are rejected or answered before persistence matters,
// so the repository is a stub that only answers what each request needs; any
// other repository call fails the request. Persistence behavior is covered by
// stories.e2e.spec.ts against PostgreSQL.

const storyId = 'boundary-story';
const interactionId = 'boundary-interaction';
const triggerId = 'boundary-trigger';
const interactionPath = `/api/stories/${storyId}/interactions/${interactionId}`;

function createRepositoryStub() {
  return {
    find: jest.fn((): Promise<Story | undefined> => Promise.resolve(undefined)),
    save: jest.fn(() => Promise.resolve()),
    list: jest.fn(() =>
      Promise.resolve({ items: [], page: 1, pageSize: STORY_LIST_PAGE_SIZE, totalCount: 0 }),
    ),
  };
}

let api: StoriesApi;
let app: INestApplication;
let httpServer: ApiHttpServer;
let repository: ReturnType<typeof createRepositoryStub>;
const { getApi, postApi, patchApi } = apiRequests(() => httpServer);

beforeEach(async () => {
  repository = createRepositoryStub();
  api = await startStoriesApi({ storiesRepository: repository });
  ({ app, httpServer } = api);
});
afterEach(() => api.close());

it('exports an attachment only to an editor', async () => {
  const story: Story = {
    id: storyId,
    title: 'Export',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    capabilities: { canRead: true, canEdit: true, canManage: false, canComment: true },
    interactions: [],
  };
  repository.find.mockResolvedValueOnce(story);
  const response = await getApi(`/api/stories/${storyId}/export`, 200);
  expect(response.headers['content-disposition']).toContain('attachment');
  expect(parseResponse(response)).toMatchObject({
    format: 'paralleax.story',
    version: 1,
    story: { title: 'Export', interactions: [] },
  });
  story.capabilities = { canRead: true, canEdit: false, canManage: false, canComment: true };
  repository.find.mockResolvedValueOnce(story);
  await getApi(`/api/stories/${storyId}/export`, 403);
});

it('rate-limits story mutations independently from reads', async () => {
  // Keep Supertest from owning and closing the shared server while concurrent requests are active.
  await app.listen(0);
  const responses = await Promise.all(
    Array.from({ length: STORY_MUTATION_RATE_LIMIT + 1 }, (_, index) =>
      request(httpServer)
        .post('/api/stories')
        .send({ title: `Story ${index}` }),
    ),
  );
  expect(responses.filter(({ status }) => status === 201)).toHaveLength(STORY_MUTATION_RATE_LIMIT);
  expect(responses.filter(({ status }) => status === 429)).toHaveLength(1);
  await getApi('/api/stories', 200);
});

it('POST /api/stories requires a non-null title', async () => {
  await postApi('/api/stories', {}, 400);
  await postApi('/api/stories', { title: null }, 400);
  await postApi('/api/stories', { title: '' }, 400);
  await postApi('/api/stories', { title: 'x'.repeat(201) }, 400);
  expect(repository.save).not.toHaveBeenCalled();
});

it('rejects raw request bodies above the global HTTP limit', async () => {
  const response = await postApi('/api/stories', { title: 'x'.repeat(140000) }, 413);
  expect(parseResponse(response)).toMatchObject({
    status: 413,
    code: 'PAYLOAD_TOO_LARGE',
    message: 'Request body is too large.',
  });
});

it('rejects invalid graph decoration presentation values', async () => {
  await postApi(
    `/api/stories/${storyId}/graph-decorations`,
    { kind: 'frame', position: { x: 0, y: 0 }, color: 'blue', width: 40 },
    400,
  );
  await postApi(
    `/api/stories/${storyId}/graph-decorations`,
    { kind: 'text', position: { x: 0, y: 0 }, fontSize: 120 },
    400,
  );
});

it('rejects interaction bodies above the authored content limit', async () => {
  await patchApi(interactionPath, { body: 'x'.repeat(MAX_INTERACTION_BODY_LENGTH + 1) }, 400);
});

it('rejects unknown interaction patch fields', async () => {
  await patchApi(interactionPath, { unexpected: true }, 400);
});

it('rejects an invalid trigger canvas position', async () => {
  await patchApi(
    `${interactionPath}/triggers/${triggerId}`,
    { position: { x: null, y: 180 } },
    400,
  );
});

it('rejects removed comment policies at the API boundary', async () => {
  await patchApi(
    `/api/stories/${storyId}/access`,
    { visibility: 'private', editPolicy: 'owner', commentPolicy: 'disabled' },
    400,
  );
  await patchApi(
    `/api/stories/${storyId}/access`,
    { visibility: 'private', editPolicy: 'owner', commentPolicy: 'authenticated' },
    400,
  );
});

it('returns 404 for unknown story ids', async () => {
  await getApi('/api/stories/missing-story', 404);
});
