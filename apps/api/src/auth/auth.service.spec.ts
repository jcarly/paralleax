import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { AppConfigService } from '../config/app-config.service';
import type { EmailService } from '../email/email.service';
import type { AccountActionTokenKind, AuthUser } from './auth.repository';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const users = new Map<string, AuthUser>();
  const sessions = new Map<string, string>();
  const actionTokens = new Map<string, { userId: string; kind: AccountActionTokenKind }>();
  const email = {
    isConfigured: true,
    send: jest.fn().mockResolvedValue({ messageId: '<email@example.com>' }),
  } as unknown as EmailService;
  const repository = {
    findUserByEmail: jest.fn((email: string) => Promise.resolve(users.get(email))),
    findUserById: jest.fn((id: string) =>
      Promise.resolve([...users.values()].find((user) => user.id === id)),
    ),
    createUser: jest.fn((user: Omit<AuthUser, 'role' | 'emailVerifiedAt'>) => {
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
    deleteOtherSessions: jest.fn((userId: string, currentTokenHash: string) => {
      for (const [tokenHash, candidateUserId] of sessions) {
        if (candidateUserId === userId && tokenHash !== currentTokenHash)
          sessions.delete(tokenHash);
      }
      return Promise.resolve();
    }),
    deleteExpiredSessions: jest.fn(() => Promise.resolve()),
    deleteExpiredAccountActionTokens: jest.fn(() => Promise.resolve()),
    createOrReplaceAccountActionToken: jest.fn(
      (token: { userId: string; kind: AccountActionTokenKind; tokenHash: string }) => {
        for (const [hash, candidate] of actionTokens) {
          if (candidate.userId === token.userId && candidate.kind === token.kind)
            actionTokens.delete(hash);
        }
        actionTokens.set(token.tokenHash, { userId: token.userId, kind: token.kind });
        return Promise.resolve();
      },
    ),
    verifyEmailWithActionToken: jest.fn((tokenHash: string, now: string) => {
      const token = actionTokens.get(tokenHash);
      if (!token || token.kind !== 'verify_email') return Promise.resolve(undefined);
      actionTokens.delete(tokenHash);
      const user = [...users.values()].find((candidate) => candidate.id === token.userId);
      if (user) user.emailVerifiedAt = now;
      return Promise.resolve(user);
    }),
    resetPasswordWithActionToken: jest.fn((tokenHash: string, passwordHash: string) => {
      const token = actionTokens.get(tokenHash);
      if (!token || token.kind !== 'reset_password') return Promise.resolve(undefined);
      actionTokens.delete(tokenHash);
      const user = [...users.values()].find((candidate) => candidate.id === token.userId);
      if (user) {
        user.passwordHash = passwordHash;
        for (const [sessionHash, candidateUserId] of sessions) {
          if (candidateUserId === user.id) sessions.delete(sessionHash);
        }
      }
      return Promise.resolve(user);
    }),
    updatePasswordAndRevokeSessions: jest.fn((userId: string, passwordHash: string) => {
      const user = [...users.values()].find((candidate) => candidate.id === userId);
      if (user) user.passwordHash = passwordHash;
      for (const [sessionHash, candidateUserId] of sessions) {
        if (candidateUserId === userId) sessions.delete(sessionHash);
      }
      return Promise.resolve();
    }),
    listUsers: jest.fn(() =>
      Promise.resolve(
        [...users.values()].map((user) => ({
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          createdAt: user.createdAt,
          ...(user.emailVerifiedAt ? { emailVerifiedAt: user.emailVerifiedAt } : {}),
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
        ...(user.emailVerifiedAt ? { emailVerifiedAt: user.emailVerifiedAt } : {}),
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
        ...(user.emailVerifiedAt ? { emailVerifiedAt: user.emailVerifiedAt } : {}),
      });
    }),
  };
  const config = { corsOrigin: 'https://app.example.com' } as AppConfigService;

  beforeEach(() => {
    users.clear();
    sessions.clear();
    actionTokens.clear();
    jest.clearAllMocks();
    Object.assign(email, { isConfigured: true });
  });

  it('requires verification before creating a session for a new registration', async () => {
    const auth = service();
    await expect(
      auth.register('Author@Example.com', 'correct horse battery staple', '  Alice   Author  '),
    ).resolves.toEqual({ email: 'author@example.com', verificationRequired: true });
    expect(sessions.size).toBe(0);
    expect(users.get('author@example.com')).toMatchObject({ displayName: 'Alice Author' });
    expect(users.get('author@example.com')?.emailVerifiedAt).toBeUndefined();
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'author@example.com',
        text: expect.stringContaining('https://app.example.com/verify-email?token='),
      }),
    );

    await expect(
      auth.login('author@example.com', 'correct horse battery staple'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    const verificationToken = emailToken();
    const verified = await auth.verifyEmail(verificationToken);
    expect(verified.user).toMatchObject({
      email: 'author@example.com',
      emailVerifiedAt: expect.any(String),
    });
    await expect(auth.userForToken(verified.token)).resolves.toMatchObject({
      email: 'author@example.com',
    });
    await expect(auth.verifyEmail(verificationToken)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not disclose whether an email can receive a password reset', async () => {
    const auth = service();
    await expect(auth.requestPasswordReset('missing@example.com')).resolves.toBeUndefined();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('resends verification for unverified accounts and uses it for their recovery request', async () => {
    const auth = service();
    await auth.register('author@example.com', 'correct horse battery staple', 'Author');
    const initialMessages = jest.mocked(email.send).mock.calls.length;

    await auth.resendVerification('AUTHOR@example.com');
    await auth.requestPasswordReset('author@example.com');

    expect(jest.mocked(email.send)).toHaveBeenCalledTimes(initialMessages + 2);
    expect(emailToken()).toBeTruthy();
    expect(jest.mocked(repository.createOrReplaceAccountActionToken)).toHaveBeenLastCalledWith(
      expect.objectContaining({ kind: 'verify_email' }),
    );
  });

  it('resets a verified password once and revokes existing sessions', async () => {
    const auth = service();
    await registerAndVerify(auth, 'author@example.com');
    const existing = await auth.login('author@example.com', 'correct horse battery staple');
    await auth.requestPasswordReset('author@example.com');
    const resetToken = emailToken();

    const reset = await auth.resetPassword(resetToken, 'new correct horse battery staple');
    await expect(auth.userForToken(existing.token)).resolves.toBeUndefined();
    await expect(auth.userForToken(reset.token)).resolves.toMatchObject({
      email: 'author@example.com',
    });
    await expect(
      auth.login('author@example.com', 'correct horse battery staple'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.resetPassword(resetToken, 'another correct password')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('requires the current password, then rotates the session after a password change', async () => {
    const auth = service();
    const registered = await registerAndVerify(auth, 'author@example.com');
    const other = await auth.login('author@example.com', 'correct horse battery staple');

    await expect(
      auth.changePassword(registered.user.id, 'wrong password', 'new correct password'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const changed = await auth.changePassword(
      registered.user.id,
      'correct horse battery staple',
      'new correct password',
    );
    await expect(auth.userForToken(other.token)).resolves.toBeUndefined();
    await expect(auth.userForToken(changed.token)).resolves.toMatchObject({
      email: 'author@example.com',
    });
  });

  it('revokes every other session while retaining the current session', async () => {
    const auth = service();
    await registerAndVerify(auth, 'author@example.com');
    const current = await auth.login('author@example.com', 'correct horse battery staple');
    const other = await auth.login('author@example.com', 'correct horse battery staple');

    await auth.revokeOtherSessions(current.user.id, current.token);
    await expect(auth.userForToken(current.token)).resolves.toMatchObject({
      email: 'author@example.com',
    });
    await expect(auth.userForToken(other.token)).resolves.toBeUndefined();
  });

  it('rejects a session-revocation request that has no current session token', async () => {
    const auth = service();
    await expect(auth.revokeOtherSessions('user-1', undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('keeps registration unavailable when email delivery is not configured', async () => {
    Object.assign(email, { isConfigured: false });
    const auth = service();
    await expect(
      auth.register('author@example.com', 'correct horse battery staple', 'Author'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'EMAIL_DELIVERY_UNAVAILABLE' }),
    });
    expect(users.size).toBe(0);
  });

  it('retains existing validation, duplicate, and administrative rules', async () => {
    const auth = service();
    await registerAndVerify(auth, 'admin@example.com');
    await expect(
      auth.register('ADMIN@example.com', 'another password', 'Someone Else'),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      auth.register('other@example.com', 'correct horse battery staple', 'x'),
    ).rejects.toBeInstanceOf(BadRequestException);
    const member = await auth.register(
      'member@example.com',
      'correct horse battery staple',
      'Member',
    );
    const memberUser = users.get(member.email)!;
    await expect(auth.listUsers('user')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(auth.updateUserRole('admin', memberUser.id, 'admin')).resolves.toMatchObject({
      id: memberUser.id,
      role: 'admin',
    });
  });

  function service() {
    return new AuthService(repository as never, email, config);
  }

  async function registerAndVerify(auth: AuthService, emailAddress: string) {
    await auth.register(emailAddress, 'correct horse battery staple', 'Author');
    return auth.verifyEmail(emailToken());
  }

  function emailToken() {
    const message = jest.mocked(email.send).mock.calls.at(-1)?.[0];
    const match = message?.text.match(/[?&]token=([^\s&]+)/u);
    if (!match?.[1]) throw new Error('Expected an account action token in the email');
    return decodeURIComponent(match[1]);
  }
});
