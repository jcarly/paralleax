import type { Pool } from 'pg';
import { assertDedicatedTestDatabase, isDedicatedTestDatabaseName } from './postgres-test-database';

function poolNamed(name: string): Pick<Pool, 'query'> {
  return { query: jest.fn().mockResolvedValue({ rows: [{ name }] }) };
}

describe('dedicated PostgreSQL test database guard', () => {
  it.each(['paralleax_test', 'PARALLEAX_TEST', 'ci_test'])('accepts %s', (name) => {
    expect(isDedicatedTestDatabaseName(name)).toBe(true);
  });

  it.each([
    'paralleax',
    'paralleax_latest',
    'test_paralleax',
    'paralleax_test_copy',
    'contest',
    '',
  ])('refuses %s', (name) => {
    expect(isDedicatedTestDatabaseName(name)).toBe(false);
  });

  it('rejects destructive setup on a database without the test suffix', async () => {
    await expect(assertDedicatedTestDatabase(poolNamed('paralleax_latest'))).rejects.toThrow(
      'Refusing to reset "paralleax_latest"',
    );
    await expect(assertDedicatedTestDatabase(poolNamed('paralleax_test'))).resolves.toBeUndefined();
  });
});
