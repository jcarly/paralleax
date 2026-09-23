import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
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
    const thread = this.threads.get(input.threadId)!;
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
    storyId: string,
    threadId: string,
    status: 'open' | 'resolved',
    actorId: string,
    timestamp: string,
  ) {
    const thread = this.threads.get(threadId)!;
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
    storyId: string,
    threadId: string,
    anchor: CommentAnchor,
    anchorLabel: string,
    timestamp: string,
  ) {
    const thread = this.threads.get(threadId)!;
    thread.anchor = anchor;
    thread.anchorLabel = anchorLabel;
    thread.updatedAt = timestamp;
    return structuredClone(thread);
  }

  async softDelete(storyId: string, threadId: string, actorId: string, timestamp: string) {
    const thread = this.threads.get(threadId)!;
    thread.deletedBy = { id: actorId, displayName: `User ${actorId}` };
    thread.deletedAt = timestamp;
    thread.updatedAt = timestamp;
    return structuredClone(thread);
  }

  async restore(storyId: string, threadId: string, timestamp: string) {
    const thread = this.threads.get(threadId)!;
    delete thread.deletedBy;
    delete thread.deletedAt;
    thread.updatedAt = timestamp;
    return structuredClone(thread);
  }
}

describe('Comments API', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];

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
    httpServer = app.getHttpServer();
  });

  afterEach(async () => app.close());

  it('creates, replies to, resolves, and lists an anchored discussion', async () => {
    const ownerCookie = 'paralleax_session=user-1';
    const createdStory = await request(httpServer)
      .post('/api/stories')
      .set('Cookie', ownerCookie)
      .send({ title: 'Reviewed story' })
      .expect(201);
    const storyId = createdStory.body.id as string;
    const interaction = await request(httpServer)
      .post(`/api/stories/${storyId}/interactions`)
      .set('Cookie', ownerCookie)
      .send({})
      .expect(201);
    await request(httpServer)
      .patch(`/api/stories/${storyId}/access`)
      .set('Cookie', ownerCookie)
      .send({ visibility: 'authenticated', editPolicy: 'owner', commentPolicy: 'readers' })
      .expect(200);

    const changes = firstValueFrom(
      app
        .get(CommentEventsService)
        .stream(storyId)
        .pipe(
          filter(({ type }) => type === 'comments-changed'),
          take(4),
          toArray(),
        ),
    );

    const created = await request(httpServer)
      .post(`/api/stories/${storyId}/comment-threads`)
      .set('Cookie', 'paralleax_session=user-2')
      .send({
        anchor: {
          kind: 'entity',
          targetType: 'interaction',
          targetId: interaction.body.interaction.id,
        },
        body: 'Could this choice be clearer?',
      })
      .expect(201);

    await request(httpServer)
      .post(`/api/stories/${storyId}/comment-threads/${created.body.id}/messages`)
      .set('Cookie', ownerCookie)
      .send({ body: 'Yes, I will rewrite it.' })
      .expect(201);
    await request(httpServer)
      .patch(`/api/stories/${storyId}/comment-threads/${created.body.id}/anchor`)
      .set('Cookie', ownerCookie)
      .send({ anchor: { kind: 'canvas', position: { x: 100, y: 200 } } })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          anchor: { kind: 'canvas', position: { x: 100, y: 200 } },
          anchorLabel: 'Story graph',
        });
      });
    await request(httpServer)
      .patch(`/api/stories/${storyId}/comment-threads/${created.body.id}/status`)
      .set('Cookie', 'paralleax_session=user-3')
      .send({ status: 'resolved' })
      .expect(403);
    await request(httpServer)
      .patch(`/api/stories/${storyId}/comment-threads/${created.body.id}/status`)
      .set('Cookie', 'paralleax_session=user-2')
      .send({ status: 'resolved' })
      .expect(200);

    const listed = await request(httpServer)
      .get(`/api/stories/${storyId}/comment-threads`)
      .set('Cookie', ownerCookie)
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
    await expect(changes).resolves.toEqual([
      expect.objectContaining({ data: expect.objectContaining({ change: 'thread-created' }) }),
      expect.objectContaining({ data: expect.objectContaining({ change: 'message-added' }) }),
      expect.objectContaining({ data: expect.objectContaining({ change: 'anchor-changed' }) }),
      expect.objectContaining({ data: expect.objectContaining({ change: 'status-changed' }) }),
    ]);
  });

  it('requires authentication, effective comment permission, and a same-story anchor', async () => {
    const ownerCookie = 'paralleax_session=user-1';
    const createdStory = await request(httpServer)
      .post('/api/stories')
      .set('Cookie', ownerCookie)
      .send({ title: 'Private comments' })
      .expect(201);
    const storyId = createdStory.body.id as string;

    await request(httpServer).get(`/api/stories/${storyId}/comment-threads`).expect(401);
    await request(httpServer).get(`/api/stories/${storyId}/comment-threads/events`).expect(401);
    await request(httpServer)
      .get(`/api/stories/${storyId}/comment-threads/events`)
      .set('Cookie', 'paralleax_session=user-2')
      .expect(404);
    await request(httpServer)
      .post(`/api/stories/${storyId}/comment-threads`)
      .set('Cookie', ownerCookie)
      .send({
        anchor: { kind: 'canvas', position: { x: 10, y: 20 } },
        body: 'Editors can comment by default.',
      })
      .expect(201);

    await request(httpServer)
      .patch(`/api/stories/${storyId}/access`)
      .set('Cookie', ownerCookie)
      .send({ visibility: 'authenticated', editPolicy: 'owner', commentPolicy: 'editors' })
      .expect(200);
    const forbiddenComment = await request(httpServer)
      .post(`/api/stories/${storyId}/comment-threads`)
      .set('Cookie', 'paralleax_session=user-2')
      .send({
        anchor: { kind: 'canvas', position: { x: 10, y: 20 } },
        body: 'Readers cannot comment under the editor policy.',
      })
      .expect(403);
    expect(forbiddenComment.body.code).toBe('COMMENT_CREATE_FORBIDDEN');
    await request(httpServer)
      .post(`/api/stories/${storyId}/comment-threads`)
      .set('Cookie', ownerCookie)
      .send({
        anchor: {
          kind: 'entity',
          targetType: 'interaction',
          targetId: 'other-story-interaction',
        },
        body: 'Wrong target.',
      })
      .expect(404);

    const interaction = await request(httpServer)
      .post(`/api/stories/${storyId}/interactions`)
      .set('Cookie', ownerCookie)
      .send({})
      .expect(201);
    await request(httpServer)
      .post(`/api/stories/${storyId}/comment-threads`)
      .set('Cookie', ownerCookie)
      .send({
        anchor: {
          kind: 'text',
          targetType: 'interaction',
          targetId: interaction.body.interaction.id,
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
      })
      .expect(400);
  });

  it('soft-deletes a whole discussion and lets only its author or a manager restore it', async () => {
    const ownerCookie = 'paralleax_session=user-1';
    const authorCookie = 'paralleax_session=user-2';
    const otherReaderCookie = 'paralleax_session=user-3';
    const createdStory = await request(httpServer)
      .post('/api/stories')
      .set('Cookie', ownerCookie)
      .send({ title: 'Recoverable comments' })
      .expect(201);
    const storyId = createdStory.body.id as string;
    await request(httpServer)
      .patch(`/api/stories/${storyId}/access`)
      .set('Cookie', ownerCookie)
      .send({ visibility: 'authenticated', editPolicy: 'owner', commentPolicy: 'readers' })
      .expect(200);
    const created = await request(httpServer)
      .post(`/api/stories/${storyId}/comment-threads`)
      .set('Cookie', authorCookie)
      .send({
        anchor: { kind: 'canvas', position: { x: 10, y: 20 } },
        body: 'Delete the whole discussion.',
      })
      .expect(201);

    const forbiddenDelete = await request(httpServer)
      .delete(`/api/stories/${storyId}/comment-threads/${created.body.id}`)
      .set('Cookie', otherReaderCookie)
      .expect(403);
    expect(forbiddenDelete.body.code).toBe('COMMENT_DELETE_FORBIDDEN');

    const deleted = await request(httpServer)
      .delete(`/api/stories/${storyId}/comment-threads/${created.body.id}`)
      .set('Cookie', authorCookie)
      .expect(200);
    expect(deleted.body).toMatchObject({
      id: created.body.id,
      deletedBy: { id: 'user-2' },
    });
    expect(deleted.body.deletedAt).toEqual(expect.any(String));

    await request(httpServer)
      .get(`/api/stories/${storyId}/comment-threads`)
      .set('Cookie', ownerCookie)
      .expect(200, []);
    const managerTrash = await request(httpServer)
      .get(`/api/stories/${storyId}/comment-threads?includeDeleted=true`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect(managerTrash.body).toHaveLength(1);
    const unrelatedTrash = await request(httpServer)
      .get(`/api/stories/${storyId}/comment-threads?includeDeleted=true`)
      .set('Cookie', otherReaderCookie)
      .expect(200);
    expect(unrelatedTrash.body).toEqual([]);

    await request(httpServer)
      .post(`/api/stories/${storyId}/comment-threads/${created.body.id}/messages`)
      .set('Cookie', authorCookie)
      .send({ body: 'This deleted thread must stay immutable.' })
      .expect(404);
    const forbiddenRestore = await request(httpServer)
      .patch(`/api/stories/${storyId}/comment-threads/${created.body.id}/restore`)
      .set('Cookie', otherReaderCookie)
      .expect(403);
    expect(forbiddenRestore.body.code).toBe('COMMENT_RESTORE_FORBIDDEN');
    await request(httpServer)
      .patch(`/api/stories/${storyId}/comment-threads/${created.body.id}/restore`)
      .set('Cookie', ownerCookie)
      .expect(200)
      .expect(({ body }) => {
        expect(body.deletedAt).toBeUndefined();
        expect(body.messages).toHaveLength(1);
      });
    const active = await request(httpServer)
      .get(`/api/stories/${storyId}/comment-threads`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect(active.body).toHaveLength(1);
  });
});
