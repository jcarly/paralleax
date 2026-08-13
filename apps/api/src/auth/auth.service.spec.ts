import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AuthUser } from './auth.repository';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const users = new Map<string, AuthUser>();
  const sessions = new Map<string, string>();
  const repository = {
    findUserByEmail: jest.fn((email: string) => Promise.resolve(users.get(email))),
    createUser: jest.fn((user: Omit<AuthUser, 'role'>) => {
      if (users.has(user.email)) return Promise.resolve(undefined);
      const created: AuthUser = { ...user, role: users.size === 0 ? 'admin' : 'user' };
      users.set(created.email, created);
      return Promise.resolve(created);
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
    listUsers: jest.fn(() =>
      Promise.resolve(
        [...users.values()].map((user) => ({
          id: user.id,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        })),
      ),
    ),
    updateUserRole: jest.fn((id: string, role: AuthUser['role']) => {
      const user = [...users.values()].find((candidate) => candidate.id === id);
      if (!user) return Promise.resolve(undefined);
      user.role = role;
      return Promise.resolve({
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      });
    }),
  };

  beforeEach(() => {
    users.clear();
    sessions.clear();
    jest.clearAllMocks();
  });

  it('registers, authenticates, resolves, and logs out a session', async () => {
    const auth = new AuthService(repository as never);
    const registered = await auth.register('Author@Example.com', 'correct horse battery staple');
    expect(registered.user.email).toBe('author@example.com');
    expect(registered.user.role).toBe('admin');
    expect(users.get('author@example.com')?.passwordHash).not.toContain('correct horse');

    const loggedIn = await auth.login('author@example.com', 'correct horse battery staple');
    await expect(auth.userForToken(loggedIn.token)).resolves.toMatchObject({
      email: 'author@example.com',
    });
    await auth.logout(loggedIn.token);
    await expect(auth.userForToken(loggedIn.token)).resolves.toBeUndefined();
  });

  it('rejects duplicate emails and invalid passwords', async () => {
    const auth = new AuthService(repository as never);
    await auth.register('author@example.com', 'correct horse battery staple');
    await expect(auth.register('AUTHOR@example.com', 'another password')).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(auth.login('author@example.com', 'wrong password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('handles a concurrent duplicate insert as a conflict', async () => {
    const auth = new AuthService(repository as never);
    repository.createUser.mockResolvedValueOnce(undefined);

    await expect(
      auth.register('author@example.com', 'correct horse battery staple'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reserves user administration for administrators', async () => {
    const auth = new AuthService(repository as never);
    await auth.register('admin@example.com', 'correct horse battery staple');
    const member = await auth.register('member@example.com', 'correct horse battery staple');

    await expect(auth.listUsers('user')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(auth.updateUserRole('admin', member.user.id, 'admin')).resolves.toMatchObject({
      id: member.user.id,
      role: 'admin',
    });
  });

  it('reports attempts to demote the last administrator', async () => {
    const auth = new AuthService(repository as never);
    const admin = await auth.register('admin@example.com', 'correct horse battery staple');
    repository.updateUserRole.mockResolvedValueOnce(undefined);

    await expect(auth.updateUserRole('admin', admin.user.id, 'user')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
