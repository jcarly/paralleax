import { Injectable } from '@nestjs/common';
import type { Story } from '@paralleax/shared';
import { DatabaseConnection } from './database.connection';
import { DatabaseMigrator } from './database.migrator';

@Injectable()
export class StoriesRepository {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly migrator: DatabaseMigrator,
  ) {}

  async list(): Promise<Story[]> {
    await this.migrator.run();
    const result = await this.database.pool.query<{ data: Story }>(
      'SELECT data FROM stories ORDER BY updated_at DESC, created_at DESC',
    );
    return result.rows.map((row) => structuredClone(row.data));
  }

  async find(id: string): Promise<Story | undefined> {
    await this.migrator.run();
    const result = await this.database.pool.query<{ data: Story }>(
      'SELECT data FROM stories WHERE id = $1',
      [id],
    );
    return result.rows[0] ? structuredClone(result.rows[0].data) : undefined;
  }

  async save(story: Story): Promise<void> {
    await this.migrator.run();
    await this.database.pool.query(
      `
        INSERT INTO stories (id, data, created_at, updated_at)
        VALUES ($1, $2::jsonb, $3, $4)
        ON CONFLICT (id) DO UPDATE
        SET data = EXCLUDED.data,
            created_at = EXCLUDED.created_at,
            updated_at = EXCLUDED.updated_at
      `,
      [story.id, JSON.stringify(story), story.createdAt, story.updatedAt],
    );
  }

  async mutate(
    id: string,
    mutation: (story: Story) => Story | Promise<Story>,
  ): Promise<Story | undefined> {
    await this.migrator.run();
    const client = await this.database.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ data: Story }>(
        'SELECT data FROM stories WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!result.rows[0]) {
        await client.query('ROLLBACK');
        return undefined;
      }

      const updated = await mutation(structuredClone(result.rows[0].data));
      await client.query(
        `
          UPDATE stories
          SET data = $2::jsonb,
              created_at = $3,
              updated_at = $4
          WHERE id = $1
        `,
        [updated.id, JSON.stringify(updated), updated.createdAt, updated.updatedAt],
      );
      await client.query('COMMIT');
      return structuredClone(updated);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(id: string): Promise<boolean> {
    await this.migrator.run();
    const result = await this.database.pool.query('DELETE FROM stories WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }
}
