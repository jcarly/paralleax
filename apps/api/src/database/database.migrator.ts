import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseConnection } from './database.connection';
import { databaseMigrations } from './database.migrations';

@Injectable()
export class DatabaseMigrator {
  private migrationRun?: Promise<void>;

  constructor(private readonly database: DatabaseConnection) {}

  run(): Promise<void> {
    this.migrationRun ??= this.runMigrations();
    return this.migrationRun;
  }

  private async runMigrations() {
    const client = await this.database.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          id text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      for (const migration of databaseMigrations) {
        const applied = await client.query<{ id: string }>(
          'SELECT id FROM schema_migrations WHERE id = $1',
          [migration.id],
        );
        if (applied.rowCount) continue;

        await this.applyMigration(client, migration.id, migration.sql);
      }
    } finally {
      client.release();
    }
  }

  private async applyMigration(client: PoolClient, id: string, sql: string) {
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [id]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
}
