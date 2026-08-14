import { Injectable } from '@nestjs/common';
import type {
  CommentAnchor,
  CommentAuthor,
  CommentMessage,
  StoryCommentThread,
} from '@paralleax/shared';
import type { PoolClient } from 'pg';
import { DatabaseConnection } from '../database/database.connection';

type ThreadRow = {
  id: string;
  story_id: string;
  anchor: CommentAnchor;
  anchor_label: string;
  status: 'open' | 'resolved';
  created_by: string;
  created_by_email: string;
  created_at: Date | string;
  updated_at: Date | string;
  resolved_by: string | null;
  resolved_by_email: string | null;
  resolved_at: Date | string | null;
};

type MessageRow = {
  id: string;
  thread_id: string;
  author_user_id: string;
  author_email: string;
  body: string;
  created_at: Date | string;
  edited_at: Date | string | null;
};

@Injectable()
export class CommentsRepository {
  constructor(private readonly database: DatabaseConnection) {}

  async list(storyId: string): Promise<StoryCommentThread[]> {
    const result = await this.database.pool.query<ThreadRow>(
      threadSelect('WHERE thread.story_id = $1') + ' ORDER BY thread.updated_at DESC',
      [storyId],
    );
    if (result.rows.length === 0) return [];
    const messages = await this.database.pool.query<MessageRow>(
      `${messageSelect()} WHERE message.thread_id = ANY($1::text[])
       ORDER BY message.created_at, message.id`,
      [result.rows.map(({ id }) => id)],
    );
    return result.rows.map((row) =>
      mapThread(
        row,
        messages.rows.filter(({ thread_id }) => thread_id === row.id),
      ),
    );
  }

  async find(storyId: string, threadId: string): Promise<StoryCommentThread | undefined> {
    const result = await this.database.pool.query<ThreadRow>(
      threadSelect('WHERE thread.story_id = $1 AND thread.id = $2'),
      [storyId, threadId],
    );
    const row = result.rows[0];
    if (!row) return undefined;
    const messages = await this.database.pool.query<MessageRow>(
      `${messageSelect()} WHERE message.thread_id = $1 ORDER BY message.created_at, message.id`,
      [threadId],
    );
    return mapThread(row, messages.rows);
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
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO story_comment_threads
         (id, story_id, anchor, anchor_label, status, created_by, created_at, updated_at)
         VALUES ($1, $2, $3::jsonb, $4, 'open', $5, $6, $6)`,
        [
          input.id,
          input.storyId,
          JSON.stringify(input.anchor),
          input.anchorLabel,
          input.authorId,
          input.timestamp,
        ],
      );
      await insertMessage(
        client,
        input.messageId,
        input.id,
        input.authorId,
        input.body,
        input.timestamp,
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.find(input.storyId, input.id);
  }

  async addMessage(input: {
    id: string;
    storyId: string;
    threadId: string;
    authorId: string;
    body: string;
    timestamp: string;
  }) {
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      await insertMessage(
        client,
        input.id,
        input.threadId,
        input.authorId,
        input.body,
        input.timestamp,
      );
      await client.query(
        `UPDATE story_comment_threads
         SET updated_at = $3, revision = revision + 1
         WHERE story_id = $1 AND id = $2`,
        [input.storyId, input.threadId, input.timestamp],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.find(input.storyId, input.threadId);
  }

  async updateStatus(
    storyId: string,
    threadId: string,
    status: 'open' | 'resolved',
    actorId: string,
    timestamp: string,
  ) {
    await this.database.pool.query(
      `UPDATE story_comment_threads
       SET status = $3,
           resolved_by = CASE WHEN $3 = 'resolved' THEN $4 ELSE NULL END,
           resolved_at = CASE WHEN $3 = 'resolved' THEN $5::timestamptz ELSE NULL END,
           updated_at = $5,
           revision = revision + 1
       WHERE story_id = $1 AND id = $2`,
      [storyId, threadId, status, actorId, timestamp],
    );
    return this.find(storyId, threadId);
  }

  async updateAnchor(
    storyId: string,
    threadId: string,
    anchor: CommentAnchor,
    anchorLabel: string,
    timestamp: string,
  ) {
    await this.database.pool.query(
      `UPDATE story_comment_threads
       SET anchor = $3::jsonb, anchor_label = $4, updated_at = $5, revision = revision + 1
       WHERE story_id = $1 AND id = $2`,
      [storyId, threadId, JSON.stringify(anchor), anchorLabel, timestamp],
    );
    return this.find(storyId, threadId);
  }
}

function threadSelect(where: string) {
  return `SELECT thread.id, thread.story_id, thread.anchor, thread.anchor_label, thread.status,
                 thread.created_by, creator.email AS created_by_email,
                 thread.created_at, thread.updated_at, thread.resolved_by,
                 resolver.email AS resolved_by_email, thread.resolved_at
          FROM story_comment_threads AS thread
          JOIN users AS creator ON creator.id = thread.created_by
          LEFT JOIN users AS resolver ON resolver.id = thread.resolved_by
          ${where}`;
}

function messageSelect() {
  return `SELECT message.id, message.thread_id, message.author_user_id,
                 author.email AS author_email, message.body,
                 message.created_at, message.edited_at
          FROM story_comment_messages AS message
          JOIN users AS author ON author.id = message.author_user_id`;
}

async function insertMessage(
  client: PoolClient,
  id: string,
  threadId: string,
  authorId: string,
  body: string,
  timestamp: string,
) {
  await client.query(
    `INSERT INTO story_comment_messages
     (id, thread_id, author_user_id, body, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, threadId, authorId, body, timestamp],
  );
}

function mapThread(row: ThreadRow, messages: MessageRow[]): StoryCommentThread {
  return {
    id: row.id,
    storyId: row.story_id,
    anchor: row.anchor,
    anchorLabel: row.anchor_label,
    status: row.status,
    createdBy: author(row.created_by, row.created_by_email),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    ...(row.resolved_by && row.resolved_by_email
      ? { resolvedBy: author(row.resolved_by, row.resolved_by_email) }
      : {}),
    ...(row.resolved_at ? { resolvedAt: iso(row.resolved_at) } : {}),
    messages: messages.map(mapMessage),
  };
}

function mapMessage(row: MessageRow): CommentMessage {
  return {
    id: row.id,
    threadId: row.thread_id,
    author: author(row.author_user_id, row.author_email),
    body: row.body,
    createdAt: iso(row.created_at),
    ...(row.edited_at ? { editedAt: iso(row.edited_at) } : {}),
  };
}

function author(id: string, email: string): CommentAuthor {
  return { id, email };
}

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
