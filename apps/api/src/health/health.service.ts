import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseConnection } from '../database/database.connection';
import { databaseMigrations } from '../database/database.migrations';

export interface HealthStatus {
  status: 'ok';
}

@Injectable()
export class HealthService {
  constructor(private readonly database: DatabaseConnection) {}

  health(): HealthStatus {
    return { status: 'ok' };
  }

  async readiness(): Promise<HealthStatus> {
    try {
      await this.database.pool.query('SELECT 1');
      const migrationTable = await this.database.pool.query<{ table_name: string | null }>(
        `SELECT to_regclass('public.schema_migrations')::text AS table_name`,
      );
      if (!migrationTable.rows[0]?.table_name) {
        throw new Error('Migration table is missing');
      }

      const latestMigrationId = databaseMigrations.at(-1)?.id;
      const migration = await this.database.pool.query<{ id: string }>(
        'SELECT id FROM schema_migrations WHERE id = $1',
        [latestMigrationId],
      );
      if (!migration.rowCount) {
        throw new Error('Database schema is not current');
      }

      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        code: 'DATABASE_NOT_READY',
        message: 'The database is unavailable or its schema is not current.',
      });
    }
  }
}
