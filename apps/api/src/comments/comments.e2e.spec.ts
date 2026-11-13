import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Server } from 'node:http';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { filter, firstValueFrom, take, toArray } from 'rxjs';
import type { CommentAnchor, StoryCommentThread } from '@paralleax/shared';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { DatabaseMigrator } from '../database/database.migrator';
import { InMemoryStoriesRepository } from '../stories/stories.repository.memory';
import { StoriesRepository } from '../stories/stories.repository';
import { CommentsRepository } from './comments.repository';
import { CommentEventsService } from './comments.events';

class InMemoryCommentsRepository {
  readonly threads = new Map<string, StoryCommentThread>();

  async list(storyId: string, includeDeleted = false) {
    return [...this.threads.values()].filter(
      (thread) => thread.storyId === storyId && (includeDeleted || !thread.deletedAt),
    );
  }

  async find(storyId: string, threadId: string, includeDeleted = false) {
    const thread = this.threads.get(threadId);
    return thread?.storyId === storyId && (includeDeleted || !thread.deletedAt)
      ? structuredClone(thread)
      : undefined;
  }

  async create(input: {
    id: string;
    storyId: string;
    anchor: CommentAnchor;
    anchorLabel: string;
    authorId: string;
    messageId: string;
    body: string;
    timestamp: string;
  }) {
    const author = { id: input.authorId, displayName: `User ${input.authorId}` };
    const thread: StoryCommentThread = {
      id: input.id,
      storyId: input.storyId,
      anchor: input.anchor,
      anchorLabel: input.anchorLabel,
      status: 'open',
      createdBy: author,
      createdAt: input.timestamp,
      updatedAt: input.timestamp,
      messages: [
        {
          id: input.messageId,
          threadId: input.id,
          author,
          body: input.body,
          createdAt: input.timestamp,
        },
      ],
    };
    this.threads.set(thread.id, thread);
    return structuredClone(thread);
  }

  async addMessage(input: {
    id: string;
    storyId: string;
    threadId: string;
    authorId: string;
    body: string;
    timestamp: string;
  }) {
    const thread = requireThread(this.threads, input.threadId);
    thread.messages.push({
      id: input.id,
      threadId: input.threadId,
      author: { id: input.authorId, displayName: `User ${input.authorId}` },
      body: input.body,
      createdAt: input.timestamp,
    });
    thread.updatedAt = input.timestamp;
    return structuredClone(thread);
  }

  async updateStatus(
    ...args: [
      storyId: string,
      threadId: string,
      status: 'open' | 'resolved',
      actorId: string,
      timestamp: string,
    ]
  ) {
    const [, threadId, status, actorId, timestamp] = args;
    const thread = requireThread(this.threads, threadId);
    thread.status = status;
    thread.updatedAt = timestamp;
    if (status === 'resolved') {
      thread.resolvedAt = timestamp;
      thread.resolvedBy = { id: actorId, displayName: `User ${actorId}` };
    } else {
      delete thread.resolvedAt;
      delete thread.resolvedBy;
    }
    return structuredClone(thread);
  }

  async updateAnchor(
    ...args: [
      storyId: string,
      threadId: string,
      anchor: CommentAnchor,
      anchorLabel: string,
      timestamp: string,
    ]
  ) {
    const [, threadId, anchor, anchorLabel, timestamp] = args;
    const thread = requireThread(this.threads, threadId);
    thread.anchor = anchor;
    thread.anchorLabel = anchorLabel;
    thread.updatedAt = timestamp;
    return structuredClone(thread);
  }

  async softDelete(storyId: string, threadId: string, actorId: string, timestamp: string) {
    const thread = requireThread(this.threads, threadId);
    thread.deletedBy = { id: actorId, displayName: `User ${actorId}` };
    thread.deletedAt = timestamp;
    thread.updatedAt = timestamp;
    return structuredClone(thread);
  }

  async restore(storyId: string, threadId: string, timestamp: string) {
    const thread = requireThread(this.threads, threadId);
    delete thread.deletedBy;
    delete thread.deletedAt;
    thread.updatedAt = timestamp;
    return structuredClone(thread);
  }
}

function requireThread(
  threads: ReadonlyMap<string, StoryCommentThread>,
  threadId: string,
): StoryCommentThread {
  const thread = threads.get(threadId);
  if (!thread) {
    throw new Error(`Comment thread ${threadId} was not found`);
  }
  return thread;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, description: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected ${description} to be an object`);
  }
  return value;
}

function responseString(value: unknown, ...path: string[]): string {
  let current = value;
  for (const key of path) {
    current = responseProperty(current, key);
  }
  if (typeof current !== 'string') {
    throw new Error(`Expected response field ${path.join('.')} to be a string`);
  }
  return current;
}

function responseProperty(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    const index = Number(key);
    if (Number.isInteger(index)) {
      return value[index];
    }
  }
  return requireRecord(value, `response at ${key}`)[key];
}

let app: INestApplication;
let httpServer: Parameters<typeof request>[0];

async function createStory(
  server: typeof httpServer,
  cookie: string,
  title: string,
): Promise<string> {
  const response = await request(server)
    .post('/api/stories')
    .set('Cookie', cookie)
    .send({ title })
    .expect(201);
  return responseString(response.body, 'id');
}

async function createInteraction(
  server: typeof httpServer,
  storyId: string,
  cookie: string,
): Promise<string> {
  const response = await createInteractionResponse(server, storyId, cookie);
  return responseString(response, 'interaction', 'id');
}

async function createInteractionWithTrigger(
  server: typeof httpServer,
  storyId: string,
  cookie: string,
): Promise<{ id: string; triggerId: string }> {
  const response = await createInteractionResponse(server, storyId, cookie);
  return {
    id: responseString(response, 'interaction', 'id'),
    triggerId: responseString(response, 'interaction', 'triggers', '0', 'id'),
  };
}

async function createInteractionResponse(
  server: typeof httpServer,
  storyId: string,
  cookie: string,
): Promise<Record<string, unknown>> {
  const response = await request(server)
    .post(`/api/stories/${storyId}/interactions`)
    .set('Cookie', cookie)
    .send({})
    .expect(201);
  return requireRecord(response.body, 'interaction creation response');
}

async function setStoryCommentPolicy(
  server: typeof httpServer,
  storyId: string,
  cookie: string,
  commentPolicy: 'readers' | 'editors',
): Promise<void> {
  await request(server)
    .patch(`/api/stories/${storyId}/access`)
    .set('Cookie', cookie)
    .send({ visibility: 'authenticated', editPolicy: 'owner', commentPolicy })
    .expect(200);
}

function listenForCommentChanges(storyId: string): Promise<unknown> {
  return firstValueFrom(
    app
      .get(CommentEventsService)
      .stream(storyId)
      .pipe(
        filter(({ type }) => type === 'comments-changed'),
        take(4),
        toArray(),
      ),
  );
}

async function readCommentChangeTypes(changes: Promise<unknown>): Promise<string[]> {
  const events = await changes;
  if (!Array.isArray(events)) {
    throw new Error('Expected a list of comment change events');
  }
  return events.map((event: unknown) => responseString(event, 'data', 'change'));
}

async function createCommentThread(input: {
  server: typeof httpServer;
  storyId: string;
  cookie: string;
  anchor: CommentAnchor;
  body: string;
}): Promise<string> {
  const response = await postCommentResponse({ ...input, expectedStatus: 201 });
  return responseString(response, 'id');
}

async function postCommentResponse(input: {
  server: typeof httpServer;
  storyId: string;
  cookie: string;
  anchor: unknown;
  body: string;
  expectedStatus: number;
}): Promise<Record<string, unknown>> {
  const response = await request(input.server)
    .post(`/api/stories/${input.storyId}/comment-threads`)
    .set('Cookie', input.cookie)
    .send({ anchor: input.anchor, body: input.body })
    .expect(input.expectedStatus);
  return requireRecord(response.body, 'comment response');
}

async function addCommentMessage(input: {
  server: typeof httpServer;
  storyId: string;
  threadId: string;
  cookie: string;
  body: string;
}): Promise<void> {
  await request(input.server)
    .post(`/api/stories/${input.storyId}/comment-threads/${input.threadId}/messages`)
    .set('Cookie', input.cookie)
    .send({ body: input.body })
    .expect(201);
}

async function updateCommentAnchor(input: {
  server: typeof httpServer;
  storyId: string;
  threadId: string;
  cookie: string;
  anchor: CommentAnchor;
}): Promise<Record<string, unknown>> {
  const response = await request(input.server)
    .patch(`/api/stories/${input.storyId}/comment-threads/${input.threadId}/anchor`)
    .set('Cookie', input.cookie)
    .send({ anchor: input.anchor })
    .expect(200);
  return requireRecord(response.body, 'anchor update response');
}

async function updateCommentStatus(input: {
  server: typeof httpServer;
  storyId: string;
  threadId: string;
  cookie: string;
  status: 'open' | 'resolved';
  expectedStatus: number;
}): Promise<void> {
  await request(input.server)
    .patch(`/api/stories/${input.storyId}/comment-threads/${input.threadId}/status`)
    .set('Cookie', input.cookie)
    .send({ status: input.status })
    .expect(input.expectedStatus);
}

async function expectStatusPermissionFlow(
  server: typeof httpServer,
  storyId: string,
  threadId: string,
): Promise<void> {
  await updateCommentStatus({
    server,
    storyId,
    threadId,
    cookie: 'paralleax_session=user-3',
    status: 'resolved',
    expectedStatus: 403,
  });
  await updateCommentStatus({
    server,
    storyId,
    threadId,
    cookie: 'paralleax_session=user-2',
    status: 'resolved',
    expectedStatus: 200,
  });
}

async function expectCommentAccessRequirements(
  server: typeof httpServer,
  storyId: string,
  ownerCookie: string,
): Promise<void> {
  await request(server).get(`/api/stories/${storyId}/comment-threads`).expect(401);
  await request(server).get(`/api/stories/${storyId}/comment-threads/events`).expect(401);
  await request(server)
    .get(`/api/stories/${storyId}/comment-threads/events`)
    .set('Cookie', 'paralleax_session=user-2')
    .expect(404);
  await postCommentResponse({
    server,
    storyId,
    cookie: ownerCookie,
    anchor: { kind: 'canvas', position: { x: 10, y: 20 } },
    body: 'Editors can comment by default.',
    expectedStatus: 201,
  });
}

async function expectCommentAnchorValidation(
  server: typeof httpServer,
  storyId: string,
  cookie: string,
  interaction: { id: string; triggerId: string },
): Promise<void> {
  const fieldComment = await postCommentResponse({
    server,
    storyId,
    cookie,
    anchor: {
      kind: 'field',
      targetType: 'interaction',
      targetId: interaction.id,
      field: 'duration',
    },
    body: 'Check the pacing.',
    expectedStatus: 201,
  });
  expect(fieldComment.anchor).toEqual({
    kind: 'field',
    targetType: 'interaction',
    targetId: interaction.id,
    field: 'duration',
  });
  expect(fieldComment.anchorLabel).toEqual(expect.stringContaining('Duration'));

  await expectInvalidCommentAnchors(server, storyId, cookie, interaction);
}

async function expectInvalidCommentAnchors(
  server: typeof httpServer,
  storyId: string,
  cookie: string,
  interaction: { id: string; triggerId: string },
): Promise<void> {
  await postCommentResponse({
    server,
    storyId,
    cookie,
    anchor: {
      kind: 'field',
      targetType: 'trigger',
      targetId: interaction.triggerId,
      field: 'duration',
    },
    body: 'Invalid semantic slot.',
    expectedStatus: 404,
  });
  await postCommentResponse({
    server,
    storyId,
    cookie,
    anchor: {
      kind: 'text',
      targetType: 'interaction',
      targetId: interaction.id,
      field: 'title',
      selector: {
        exact: 'text that is not in the title',
        prefix: '',
        suffix: '',
        start: 0,
        end: 29,
        sourceHash: 'test',
      },
    },
    body: 'Invalid quote.',
    expectedStatus: 400,
  });
}

async function expectDiscussionResult(
  server: typeof httpServer,
  storyId: string,
  cookie: string,
  changes: Promise<unknown>,
): Promise<void> {
  const listed = await request(server)
    .get(`/api/stories/${storyId}/comment-threads`)
    .set('Cookie', cookie)
    .expect(200);
  expect(listed.body).toEqual([
    expect.objectContaining({
      status: 'resolved',
      anchorLabel: 'Story graph',
      messages: [
        expect.objectContaining({ body: 'Could this choice be clearer?' }),
        expect.objectContaining({ body: 'Yes, I will rewrite it.' }),
      ],
    }),
  ]);
  await expect(readCommentChangeTypes(changes)).resolves.toEqual([
    'thread-created',
    'message-added',
    'anchor-changed',
    'status-changed',
  ]);
}

beforeEach(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StoriesRepository)
    .useClass(InMemoryStoriesRepository)
    .overrideProvider(CommentsRepository)
    .useClass(InMemoryCommentsRepository)
    .overrideProvider(DatabaseMigrator)
    .useValue({ run: jest.fn().mockResolvedValue(undefined) })
    .overrideProvider(AuthService)
    .useValue({
      userForToken: jest.fn((token?: string) =>
        Promise.resolve(
          token
            ? {
                id: token,
                email: `${token}@paralleax.invalid`,
                displayName: `User ${token}`,
                role: 'user',
                createdAt: '2026-01-01T00:00:00.000Z',
              }
            : undefined,
        ),
      ),
    })
    .compile();

  app = module.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.setGlobalPrefix('api');
  await app.init();
  const server: unknown = app.getHttpServer();
  if (!(server instanceof Server)) {
    throw new Error('Expected Nest to create an HTTP server');
  }
  httpServer = server;
});

afterEach(async () => app.close());

it('creates, replies to, resolves, and lists an anchored discussion', async () => {
  const ownerCookie = 'paralleax_session=user-1';
  const storyId = await createStory(httpServer, ownerCookie, 'Reviewed story');
  const interactionId = await createInteraction(httpServer, storyId, ownerCookie);
  await setStoryCommentPolicy(httpServer, storyId, ownerCookie, 'readers');

  const changes = listenForCommentChanges(storyId);
  const threadId = await createCommentThread({
    server: httpServer,
    storyId,
    cookie: 'paralleax_session=user-2',
    anchor: { kind: 'entity', targetType: 'interaction', targetId: interactionId },
    body: 'Could this choice be clearer?',
  });
  await addCommentMessage({
    server: httpServer,
    storyId,
    threadId,
    cookie: ownerCookie,
    body: 'Yes, I will rewrite it.',
  });

  const anchorUpdate = await updateCommentAnchor({
    server: httpServer,
    storyId,
    threadId,
    cookie: ownerCookie,
    anchor: { kind: 'canvas', position: { x: 100, y: 200 } },
  });
  expect(anchorUpdate).toMatchObject({
    anchor: { kind: 'canvas', position: { x: 100, y: 200 } },
    anchorLabel: 'Story graph',
  });
  await expectStatusPermissionFlow(httpServer, storyId, threadId);
  await expectDiscussionResult(httpServer, storyId, ownerCookie, changes);
});

it('requires authentication, effective comment permission, and a same-story anchor', async () => {
  const ownerCookie = 'paralleax_session=user-1';
  const storyId = await createStory(httpServer, ownerCookie, 'Private comments');
  await expectCommentAccessRequirements(httpServer, storyId, ownerCookie);
  await setStoryCommentPolicy(httpServer, storyId, ownerCookie, 'editors');

  const forbiddenComment = await postCommentResponse({
    server: httpServer,
    storyId,
    cookie: 'paralleax_session=user-2',
    anchor: { kind: 'canvas', position: { x: 10, y: 20 } },
    body: 'Readers cannot comment under the editor policy.',
    expectedStatus: 403,
  });
  expect(forbiddenComment.code).toBe('COMMENT_CREATE_FORBIDDEN');
  await postCommentResponse({
    server: httpServer,
    storyId,
    cookie: ownerCookie,
    anchor: { kind: 'entity', targetType: 'interaction', targetId: 'other-story-interaction' },
    body: 'Wrong target.',
    expectedStatus: 404,
  });

  const interaction = await createInteractionWithTrigger(httpServer, storyId, ownerCookie);
  await expectCommentAnchorValidation(httpServer, storyId, ownerCookie, interaction);
});

it('soft-deletes a whole discussion and lets only its author or a manager restore it', async () => {
  const ownerCookie = 'paralleax_session=user-1';
  const authorCookie = 'paralleax_session=user-2';
  const otherReaderCookie = 'paralleax_session=user-3';
  const storyId = await createStory(httpServer, ownerCookie, 'Recoverable comments');
  await setStoryCommentPolicy(httpServer, storyId, ownerCookie, 'readers');
  const threadId = await createCommentThread({
    server: httpServer,
    storyId,
    cookie: authorCookie,
    anchor: { kind: 'canvas', position: { x: 10, y: 20 } },
    body: 'Delete the whole discussion.',
  });

  await expectAuthorDeletePermission({
    server: httpServer,
    storyId,
    threadId,
    authorCookie,
    otherReaderCookie,
  });
  await expectDeletedThreadVisibility({
    server: httpServer,
    storyId,
    threadId,
    ownerCookie,
    authorCookie,
    otherReaderCookie,
  });
  await expectManagerRestorePermission({
    server: httpServer,
    storyId,
    threadId,
    ownerCookie,
    otherReaderCookie,
  });
});

type ThreadPermissionContext = {
  server: typeof httpServer;
  storyId: string;
  threadId: string;
  ownerCookie: string;
  authorCookie: string;
  otherReaderCookie: string;
};

async function expectAuthorDeletePermission(
  input: Pick<
    ThreadPermissionContext,
    'server' | 'storyId' | 'threadId' | 'authorCookie' | 'otherReaderCookie'
  >,
): Promise<void> {
  const forbidden = await request(input.server)
    .delete(`/api/stories/${input.storyId}/comment-threads/${input.threadId}`)
    .set('Cookie', input.otherReaderCookie)
    .expect(403);
  expect(responseString(forbidden.body, 'code')).toBe('COMMENT_DELETE_FORBIDDEN');

  const deleted = await request(input.server)
    .delete(`/api/stories/${input.storyId}/comment-threads/${input.threadId}`)
    .set('Cookie', input.authorCookie)
    .expect(200);
  const deletedBody = requireRecord(deleted.body, 'deleted thread response');
  expect(deletedBody).toMatchObject({
    id: input.threadId,
    deletedBy: { id: 'user-2' },
  });
  expect(deletedBody.deletedAt).toEqual(expect.any(String));
}

async function expectDeletedThreadVisibility(input: ThreadPermissionContext): Promise<void> {
  await request(input.server)
    .get(`/api/stories/${input.storyId}/comment-threads`)
    .set('Cookie', input.ownerCookie)
    .expect(200, []);
  const managerTrash = await request(input.server)
    .get(`/api/stories/${input.storyId}/comment-threads?includeDeleted=true`)
    .set('Cookie', input.ownerCookie)
    .expect(200);
  expect(managerTrash.body).toHaveLength(1);
  const unrelatedTrash = await request(input.server)
    .get(`/api/stories/${input.storyId}/comment-threads?includeDeleted=true`)
    .set('Cookie', input.otherReaderCookie)
    .expect(200);
  expect(unrelatedTrash.body).toEqual([]);
  await request(input.server)
    .post(`/api/stories/${input.storyId}/comment-threads/${input.threadId}/messages`)
    .set('Cookie', input.authorCookie)
    .send({ body: 'This deleted thread must stay immutable.' })
    .expect(404);
}

async function expectManagerRestorePermission(
  input: Pick<
    ThreadPermissionContext,
    'server' | 'storyId' | 'threadId' | 'ownerCookie' | 'otherReaderCookie'
  >,
): Promise<void> {
  const forbidden = await request(input.server)
    .patch(`/api/stories/${input.storyId}/comment-threads/${input.threadId}/restore`)
    .set('Cookie', input.otherReaderCookie)
    .expect(403);
  expect(responseString(forbidden.body, 'code')).toBe('COMMENT_RESTORE_FORBIDDEN');

  const restored = await request(input.server)
    .patch(`/api/stories/${input.storyId}/comment-threads/${input.threadId}/restore`)
    .set('Cookie', input.ownerCookie)
    .expect(200);
  const restoredBody = requireRecord(restored.body, 'restored thread response');
  expect(restoredBody.deletedAt).toBeUndefined();
  expect(restoredBody.messages).toHaveLength(1);
  const active = await request(input.server)
    .get(`/api/stories/${input.storyId}/comment-threads`)
    .set('Cookie', input.ownerCookie)
    .expect(200);
  expect(active.body).toHaveLength(1);
}
