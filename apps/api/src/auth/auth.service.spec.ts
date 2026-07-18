import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { AuthUser } from './auth.repository';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const users = new Map<string, AuthUser>();
  const sessions = new Map<string, string>();
  const repository = {
    findUserByEmail: jest.fn((email: string) => Promise.resolve(users.get(email))),
    createUser: jest.fn((user: AuthUser) => {
      if (users.has(user.email)) return Promise.resolve(false);
      users.set(user.email, user);
      return Promise.resolve(true);
    }),
    createSession: jest.fn((session: { tokenHash: string; userId: string }) => {
      sessions.set(session.tokenHash, session.userId);
      return Promise.resolve();
    }),
    findUserBySessionHash: jest.fn((tokenHash: string) => {
      const userId = sessions.get(tokenHash);
      return Promise.resolve([...users.values()].find((user) => user.id === userId));
    }),
    deleteSession: jest.fn((tokenHash: string) => {
      sessions.delete(tokenHash);
      return Promise.resolve();
    }),
    deleteExpiredSessions: jest.fn(() => Promise.resolve()),
    claimMigratedStories: jest.fn(() => Promise.resolve(0)),
  };

  beforeEach(() => {
    users.clear();
    sessions.clear();
    jest.clearAllMocks();
  });

  it('registers, authenticates, resolves, and logs out a session', async () => {
    const auth = new AuthService(repository as never, config() as never);
    const registered = await auth.register('Author@Example.com', 'correct horse battery staple');
    expect(registered.user.email).toBe('author@example.com');
    expect(users.get('author@example.com')?.passwordHash).not.toContain('correct horse');

    const loggedIn = await auth.login('author@example.com', 'correct horse battery staple');
    await expect(auth.userForToken(loggedIn.token)).resolves.toMatchObject({
      email: 'author@example.com',
    });
    await auth.logout(loggedIn.token);
    await expect(auth.userForToken(loggedIn.token)).resolves.toBeUndefined();
  });

  it('rejects duplicate emails and invalid passwords', async () => {
    const auth = new AuthService(repository as never, config() as never);
    await auth.register('author@example.com', 'correct horse battery staple');
    await expect(auth.register('AUTHOR@example.com', 'another password')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(auth.login('author@example.com', 'wrong password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('handles a concurrent duplicate insert as a conflict', async () => {
    const auth = new AuthService(repository as never, config() as never);
    repository.createUser.mockResolvedValueOnce(false);

    await expect(
      auth.register('author@example.com', 'correct horse battery staple'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('claims quarantined stories only for the configured legacy owner', async () => {
    const auth = new AuthService(repository as never, config('legacy@example.com') as never);

    const registered = await auth.register('Legacy@Example.com', 'correct horse battery staple');
    expect(repository.claimMigratedStories).toHaveBeenCalledWith(registered.user.id);
  });
});

function config(legacyStoryOwnerEmail?: string) {
  return { legacyStoryOwnerEmail };
}
