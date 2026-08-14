import { randomUUID } from 'node:crypto';
import type { Story } from '@paralleax/shared';
import { Pool } from 'pg';
import type { DatabaseConnection } from '../database/database.connection';
import { DatabaseMigrator } from '../database/database.migrator';
import { StoriesRepository } from '../stories/stories.repository';
import { CommentsRepository } from './comments.repository';

const connectionString = process.env.POSTGRES_TEST_DATABASE_URL;
const describePostgres = connectionString ? describe : describe.skip;

describePostgres('CommentsRepository PostgreSQL integration', () => {
  const pool = new Pool({ connectionString });
  const database = { pool } as DatabaseConnection;
  const migrator = new DatabaseMigrator(database);
  const stories = new StoriesRepository(database);
  const comments = new CommentsRepository(database);
  const ownerId = `comment-owner-${randomUUID()}`;
  const storyId = `comment-story-${randomUUID()}`;

  beforeAll(async () => {
    await waitForPostgres(pool);
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await migrator.run();
    await pool.query(
      `INSERT INTO users (id, email, password_hash, role, created_at)
       VALUES ($1, $2, 'test-only', 'user', now())`,
      [ownerId, `${ownerId}@example.test`],
    );
    const timestamp = new Date().toISOString();
    const story: Story = {
      id: storyId,
      title: 'Commented story',
      createdAt: timestamp,
      updatedAt: timestamp,
      interactions: [
        {
          id: 'interaction-1',
          title: 'Arrival',
          body: 'The harbor is quiet.',
          position: { x: 80, y: 120 },
          triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
        },
      ],
    };
    await stories.save(story, ownerId);
  }, 30_000);

  afterAll(async () => pool.end());

  it('persists a thread and replies transactionally, then cascades them with the story', async () => {
    const firstTimestamp = '2026-08-13T09:00:00.000Z';
    const created = await comments.create({
      id: 'thread-1',
      storyId,
      anchor: { kind: 'entity', targetType: 'interaction', targetId: 'interaction-1' },
      anchorLabel: 'Arrival',
      authorId: ownerId,
      messageId: 'message-1',
      body: 'Initial note',
      timestamp: firstTimestamp,
    });
    expect(created).toMatchObject({
      id: 'thread-1',
      status: 'open',
      messages: [{ id: 'message-1', body: 'Initial note' }],
    });

    const replied = await comments.addMessage({
      id: 'message-2',
      storyId,
      threadId: 'thread-1',
      authorId: ownerId,
      body: 'Follow-up',
      timestamp: '2026-08-13T09:05:00.000Z',
    });
    expect(replied?.messages.map(({ body }) => body)).toEqual(['Initial note', 'Follow-up']);

    await comments.updateStatus(
      storyId,
      'thread-1',
      'resolved',
      ownerId,
      '2026-08-13T09:10:00.000Z',
    );
    await stories.delete(storyId, ownerId);

    await expect(pool.query('SELECT id FROM story_comment_threads')).resolves.toMatchObject({
      rows: [],
    });
    await expect(pool.query('SELECT id FROM story_comment_messages')).resolves.toMatchObject({
      rows: [],
    });
  });
});

async function waitForPostgres(pool: Pool) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error('PostgreSQL did not become ready in time');
}
