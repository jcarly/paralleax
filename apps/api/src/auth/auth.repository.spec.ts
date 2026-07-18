import type { DatabaseConnection } from '../database/database.connection';
import type { DatabaseMigrator } from '../database/database.migrator';
import { AuthRepository, type AuthUser } from './auth.repository';

describe('AuthRepository', () => {
  const query = jest.fn();
  const migrator = { run: jest.fn().mockResolvedValue(undefined) } as unknown as DatabaseMigrator;
  const repository = new AuthRepository(
    { pool: { query } } as unknown as DatabaseConnection,
    migrator,
  );
  const user: AuthUser = {
    id: 'user-1',
    email: 'author@example.com',
    passwordHash: 'scrypt:salt:hash',
    createdAt: '2026-07-18T00:00:00.000Z',
  };

  beforeEach(() => jest.clearAllMocks());

  it('creates a user atomically and reports email conflicts', async () => {
    query.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 });
    await expect(repository.createUser(user)).resolves.toBe(true);
    await expect(repository.createUser(user)).resolves.toBe(false);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (email) DO NOTHING'), [
      user.id,
      user.email,
      user.passwordHash,
      user.createdAt,
    ]);
  });

  it('loads users by email and active session', async () => {
    const row = {
      id: user.id,
      email: user.email,
      password_hash: user.passwordHash,
      created_at: new Date(user.createdAt),
    };
    query.mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [row] });

    await expect(repository.findUserByEmail(user.email)).resolves.toEqual(user);
    await expect(repository.findUserBySessionHash('token-hash')).resolves.toEqual(user);
  });

  it('creates and removes sessions and purges expired ones', async () => {
    query.mockResolvedValue({ rowCount: 1 });
    await repository.createSession({
      id: 'session-1',
      userId: user.id,
      tokenHash: 'token-hash',
      createdAt: user.createdAt,
      expiresAt: '2026-08-18T00:00:00.000Z',
    });
    await repository.deleteExpiredSessions();
    await repository.deleteSession('token-hash');

    expect(query).toHaveBeenCalledWith('DELETE FROM sessions WHERE expires_at <= now()');
    expect(query).toHaveBeenCalledWith('DELETE FROM sessions WHERE token_hash = $1', [
      'token-hash',
    ]);
  });

  it('claims stories quarantined under the migration user', async () => {
    query.mockResolvedValue({ rowCount: 3 });
    await expect(repository.claimMigratedStories(user.id)).resolves.toBe(3);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("creator_user_id = 'migration-user'"),
      [user.id],
    );
  });
});
