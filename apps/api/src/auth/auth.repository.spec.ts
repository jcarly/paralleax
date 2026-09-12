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
    displayName: 'Author',
    passwordHash: 'scrypt:salt:hash',
    role: 'admin',
    createdAt: '2026-07-18T00:00:00.000Z',
  };

  beforeEach(() => jest.clearAllMocks());

  it('creates a user atomically and reports email conflicts', async () => {
    const row = {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
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
      [user.id, user.email, user.displayName, user.passwordHash, user.createdAt],
    );
  });

  it('loads users by email and active session', async () => {
    const row = {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
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

  it('lists managed users and updates a role transactionally', async () => {
    const row = {
      id: user.id,
      email: user.email,
      display_name: user.displayName,
      role: 'user' as const,
      created_at: new Date(user.createdAt),
    };
    query.mockResolvedValueOnce({ rows: [row] });
    clientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({});

    await expect(repository.listUsers()).resolves.toEqual([
      {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: 'user',
        createdAt: user.createdAt,
      },
    ]);
    await expect(repository.updateUserRole(user.id, 'user')).resolves.toEqual({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: 'user',
      createdAt: user.createdAt,
    });

    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE users AS target'), [
      user.id,
      'user',
    ]);
    expect(clientQuery).toHaveBeenCalledWith('COMMIT');
    expect(release).toHaveBeenCalled();
  });

  it('updates the current display name without changing the account email', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: user.id,
          email: user.email,
          display_name: 'New Author',
          role: user.role,
          created_at: new Date(user.createdAt),
        },
      ],
    });

    await expect(repository.updateDisplayName(user.id, 'New Author')).resolves.toEqual({
      id: user.id,
      email: user.email,
      displayName: 'New Author',
      role: user.role,
      createdAt: user.createdAt,
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('SET display_name = $2'), [
      user.id,
      'New Author',
    ]);
  });

  it('returns no user when a role update is rejected by the final-admin guard', async () => {
    clientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({});

    await expect(repository.updateUserRole(user.id, 'user')).resolves.toBeUndefined();
  });

  it('rolls back and releases the client when a role update fails', async () => {
    const failure = new Error('database unavailable');
    clientQuery
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({});

    await expect(repository.updateUserRole(user.id, 'admin')).rejects.toBe(failure);
    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(release).toHaveBeenCalled();
  });
});
