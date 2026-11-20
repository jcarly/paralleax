import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DatabaseConnection } from '../database/database.connection';
import { databaseMigrations } from '../database/database.migrations';
import { HealthService } from './health.service';

const query = jest.fn();
let service: HealthService;

beforeAll(async () => {
  const module = await Test.createTestingModule({
    providers: [HealthService, { provide: DatabaseConnection, useValue: { pool: { query } } }],
  }).compile();
  service = module.get(HealthService);
});

beforeEach(() => {
  query.mockReset();
});

describe('HealthService process health', () => {
  it('reports process health without querying PostgreSQL', () => {
    expect(service.health()).toEqual({ status: 'ok' });
    expect(query).not.toHaveBeenCalled();
  });
});

describe('HealthService readiness', () => {
  it('reports readiness when PostgreSQL is reachable and the schema is current', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ table_name: 'schema_migrations' }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [{ id: databaseMigrations.at(-1)?.id }],
        rowCount: 1,
      });

    await expect(service.readiness()).resolves.toEqual({ status: 'ok' });
    expect(query).toHaveBeenLastCalledWith('SELECT id FROM schema_migrations WHERE id = $1', [
      databaseMigrations.at(-1)?.id,
    ]);
  });

  it.each([
    ['PostgreSQL is unavailable', () => query.mockRejectedValueOnce(new Error('offline'))],
    [
      'the migration table is missing',
      () =>
        query
          .mockResolvedValueOnce({ rows: [], rowCount: 1 })
          .mockResolvedValueOnce({ rows: [{ table_name: null }], rowCount: 1 }),
    ],
    [
      'the latest migration is missing',
      () =>
        query
          .mockResolvedValueOnce({ rows: [], rowCount: 1 })
          .mockResolvedValueOnce({
            rows: [{ table_name: 'schema_migrations' }],
            rowCount: 1,
          })
          .mockResolvedValueOnce({ rows: [], rowCount: 0 }),
    ],
  ])('reports unavailability when %s', async (_, arrange) => {
    arrange();

    await expect(service.readiness()).rejects.toEqual(
      new ServiceUnavailableException({
        status: 'unavailable',
        code: 'DATABASE_NOT_READY',
        message: 'The database is unavailable or its schema is not current.',
      }),
    );
  });
});
