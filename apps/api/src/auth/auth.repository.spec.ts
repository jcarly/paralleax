import type { DatabaseConnection } from '../database/database.connection';
import { AuthRepository, type AuthUser } from './auth.repository';

describe('AuthRepository', () => {
  const query = jest.fn();
  const clientQuery = jest.fn();
  const release = jest.fn();
  const repository = new AuthRepository({
    pool: { query, connect: jest.fn().mockResolvedValue({ query: clientQuery, release }) },
  } as unknown as DatabaseConnection);
  const user: AuthUser = {
    id: 'user-1',
    email: 'author@example.com',
    passwordHash: 'scrypt:salt:hash',
    role: 'admin',
    createdAt: '2026-07-18T00:00:00.000Z',
  };

  beforeEach(() => jest.clearAllMocks());

  it('creates a user atomically and reports email conflicts', async () => {
    const row = {
      id: user.id,
      email: user.email,
      password_hash: user.passwordHash,
      role: user.role,
      created_at: new Date(user.createdAt),
    };
    clientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});
    await expect(repository.createUser(user)).resolves.toEqual(user);
    await expect(repository.createUser(user)).resolves.toBeUndefined();
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (email) DO NOTHING'),
      [user.id, user.email, user.passwordHash, user.createdAt],
    );
  });

  it('loads users by email and active session', async () => {
    const row = {
      id: user.id,
      email: user.email,
      password_hash: user.passwordHash,
      role: user.role,
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
});
