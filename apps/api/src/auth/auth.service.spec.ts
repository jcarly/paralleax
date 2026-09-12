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
          displayName: user.displayName,
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
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
      });
    }),
    updateDisplayName: jest.fn((id: string, displayName: string) => {
      const user = [...users.values()].find((candidate) => candidate.id === id);
      if (!user) return Promise.resolve(undefined);
      user.displayName = displayName;
      return Promise.resolve({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
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
    const registered = await auth.register(
      'Author@Example.com',
      'correct horse battery staple',
      '  Alice   Author  ',
    );
    expect(registered.user.email).toBe('author@example.com');
    expect(registered.user.role).toBe('admin');
    expect(registered.user.displayName).toBe('Alice Author');
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
    await auth.register('author@example.com', 'correct horse battery staple', 'Author');
    await expect(
      auth.register('AUTHOR@example.com', 'another password', 'Someone Else'),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(auth.login('author@example.com', 'wrong password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('normalizes renames and rejects invalid display names', async () => {
    const auth = new AuthService(repository as never);
    const registered = await auth.register(
      'author@example.com',
      'correct horse battery staple',
      'Alice',
    );

    await expect(
      auth.updateDisplayName(registered.user.id, '  Alice   Cooper  '),
    ).resolves.toMatchObject({
      displayName: 'Alice Cooper',
      email: 'author@example.com',
    });
    await expect(auth.updateDisplayName(registered.user.id, ' ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      auth.register('other@example.com', 'correct horse battery staple', 'x'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows different accounts to share the same display name', async () => {
    const auth = new AuthService(repository as never);

    await expect(
      auth.register('alice@example.com', 'correct horse battery staple', 'Shared Name'),
    ).resolves.toBeDefined();
    await expect(
      auth.register('bob@example.com', 'correct horse battery staple', 'Shared Name'),
    ).resolves.toBeDefined();
  });

  it('handles a concurrent duplicate insert as a conflict', async () => {
    const auth = new AuthService(repository as never);
    repository.createUser.mockResolvedValueOnce(undefined);

    await expect(
      auth.register('author@example.com', 'correct horse battery staple', 'Author'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reserves user administration for administrators', async () => {
    const auth = new AuthService(repository as never);
    await auth.register('admin@example.com', 'correct horse battery staple', 'Admin');
    const member = await auth.register(
      'member@example.com',
      'correct horse battery staple',
      'Member',
    );

    await expect(auth.listUsers('user')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(auth.updateUserRole('admin', member.user.id, 'admin')).resolves.toMatchObject({
      id: member.user.id,
      role: 'admin',
    });
  });

  it('reports attempts to demote the last administrator', async () => {
    const auth = new AuthService(repository as never);
    const admin = await auth.register('admin@example.com', 'correct horse battery staple', 'Admin');
    repository.updateUserRole.mockResolvedValueOnce(undefined);

    await expect(auth.updateUserRole('admin', admin.user.id, 'user')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
