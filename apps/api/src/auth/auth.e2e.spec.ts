import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { DatabaseMigrator } from '../database/database.migrator';
import { EmailService, type EmailMessage } from '../email/email.service';
import { InMemoryStoriesRepository } from '../stories/stories.repository.memory';
import { StoriesRepository } from '../stories/stories.repository';
import { AuthRepository, type AccountActionTokenKind, type AuthUser } from './auth.repository';

describe('Auth API', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let sentMessages: EmailMessage[];

  beforeEach(async () => {
    const users = new Map<string, AuthUser>();
    const sessions = new Map<string, { userId: string; expiresAt: string }>();
    const actionTokens = new Map<string, { userId: string; kind: AccountActionTokenKind }>();
    sentMessages = [];
    const authRepository = {
      findUserByEmail: (email: string) => Promise.resolve(users.get(email)),
      findUserById: (id: string) =>
        Promise.resolve([...users.values()].find((candidate) => candidate.id === id)),
      createUser: (user: Omit<AuthUser, 'role' | 'emailVerifiedAt'>) => {
        if (users.has(user.email)) return Promise.resolve(undefined);
        const created: AuthUser = { ...user, role: users.size === 0 ? 'admin' : 'user' };
        users.set(created.email, created);
        return Promise.resolve(created);
      },
      createSession: (session: { tokenHash: string; userId: string; expiresAt: string }) => {
        sessions.set(session.tokenHash, session);
        return Promise.resolve();
      },
      findUserBySessionHash: (tokenHash: string) => {
        const session = sessions.get(tokenHash);
        return Promise.resolve(
          session && new Date(session.expiresAt) > new Date()
            ? [...users.values()].find((user) => user.id === session.userId)
            : undefined,
        );
      },
      deleteSession: (tokenHash: string) => {
        sessions.delete(tokenHash);
        return Promise.resolve();
      },
      deleteOtherSessions: (userId: string, currentTokenHash: string) => {
        for (const [tokenHash, session] of sessions) {
          if (session.userId === userId && tokenHash !== currentTokenHash)
            sessions.delete(tokenHash);
        }
        return Promise.resolve();
      },
      deleteExpiredSessions: () => {
        const now = new Date();
        for (const [tokenHash, session] of sessions) {
          if (new Date(session.expiresAt) <= now) sessions.delete(tokenHash);
        }
        return Promise.resolve();
      },
      deleteExpiredAccountActionTokens: () => Promise.resolve(),
      createOrReplaceAccountActionToken: (token: {
        userId: string;
        kind: AccountActionTokenKind;
        tokenHash: string;
      }) => {
        for (const [tokenHash, candidate] of actionTokens) {
          if (candidate.userId === token.userId && candidate.kind === token.kind) {
            actionTokens.delete(tokenHash);
          }
        }
        actionTokens.set(token.tokenHash, { userId: token.userId, kind: token.kind });
        return Promise.resolve();
      },
      verifyEmailWithActionToken: (tokenHash: string, now: string) => {
        const token = actionTokens.get(tokenHash);
        if (!token || token.kind !== 'verify_email') return Promise.resolve(undefined);
        actionTokens.delete(tokenHash);
        const user = [...users.values()].find((candidate) => candidate.id === token.userId);
        if (user) user.emailVerifiedAt = now;
        return Promise.resolve(user);
      },
      resetPasswordWithActionToken: (tokenHash: string, passwordHash: string) => {
        const token = actionTokens.get(tokenHash);
        if (!token || token.kind !== 'reset_password') return Promise.resolve(undefined);
        actionTokens.delete(tokenHash);
        const user = [...users.values()].find((candidate) => candidate.id === token.userId);
        if (user) {
          user.passwordHash = passwordHash;
          for (const [sessionHash, session] of sessions) {
            if (session.userId === user.id) sessions.delete(sessionHash);
          }
        }
        return Promise.resolve(user);
      },
      updatePasswordAndRevokeSessions: (userId: string, passwordHash: string) => {
        const user = [...users.values()].find((candidate) => candidate.id === userId);
        if (user) user.passwordHash = passwordHash;
        for (const [sessionHash, session] of sessions) {
          if (session.userId === userId) sessions.delete(sessionHash);
        }
        return Promise.resolve();
      },
      updateDisplayName: (id: string, displayName: string) => {
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
      },
      claimMigratedStories: () => Promise.resolve(0),
    };
    const email = {
      isConfigured: true,
      send: (message: EmailMessage) => {
        sentMessages.push(message);
        return Promise.resolve({ messageId: `<${sentMessages.length}@example.com>` });
      },
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepository)
      .overrideProvider(EmailService)
      .useValue(email)
      .overrideProvider(StoriesRepository)
      .useClass(InMemoryStoriesRepository)
      .overrideProvider(DatabaseMigrator)
      .useValue({ run: jest.fn().mockResolvedValue(undefined) })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.setGlobalPrefix('api');
    await app.init();
    httpServer = app.getHttpServer();
  });

  afterEach(async () => app.close());

  it('verifies a new account before issuing a session, then logs out', async () => {
    const agent = request.agent(httpServer);
    const registered = await agent
      .post('/api/auth/register')
      .send({
        email: 'Author@Example.com',
        password: 'correct horse battery staple',
        displayName: 'Alice Author',
      })
      .expect(201);
    expect(registered.body).toEqual({ email: 'author@example.com', verificationRequired: true });
    expect(registered.headers['set-cookie']).toBeUndefined();
    await agent
      .post('/api/auth/login')
      .send({
        email: 'author@example.com',
        password: 'correct horse battery staple',
      })
      .expect(403);

    await agent.post('/api/auth/verify-email').send({ token: tokenFromLastEmail() }).expect(200);
    await agent
      .get('/api/auth/me')
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          email: 'author@example.com',
          emailVerifiedAt: expect.any(String),
        });
      });
    await agent
      .patch('/api/auth/me')
      .send({ displayName: 'Renamed Author' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          email: 'author@example.com',
          displayName: 'Renamed Author',
        });
      });
    await agent.post('/api/auth/logout').expect(204);
    await agent.get('/api/auth/me').expect(401);
  });

  it('returns a neutral password-reset response for an unknown email', async () => {
    await request(httpServer)
      .post('/api/auth/password-reset')
      .send({ email: 'missing@example.com' })
      .expect(204);
    expect(sentMessages).toEqual([]);
  });

  it('resends verification, rotates passwords, and revokes other sessions through the API', async () => {
    const agent = request.agent(httpServer);
    await agent
      .post('/api/auth/register')
      .send({
        email: 'security@example.com',
        password: 'correct horse battery staple',
        displayName: 'Security Author',
      })
      .expect(201);
    await agent
      .post('/api/auth/resend-verification')
      .send({ email: 'security@example.com' })
      .expect(204);
    await agent.post('/api/auth/verify-email').send({ token: tokenFromLastEmail() }).expect(200);
    await agent
      .post('/api/auth/login')
      .send({ email: 'security@example.com', password: 'correct horse battery staple' })
      .expect(200);
    await agent.post('/api/auth/sessions/revoke-others').expect(204);
    await agent
      .patch('/api/auth/me/password')
      .send({
        currentPassword: 'correct horse battery staple',
        password: 'changed horse battery staple',
      })
      .expect(200)
      .expect(({ body }) => expect(body.email).toBe('security@example.com'));
    await agent
      .post('/api/auth/password-reset')
      .send({ email: 'security@example.com' })
      .expect(204);

    const resetToken = tokenFromLastEmail();
    await agent
      .post('/api/auth/password-reset/confirm')
      .send({ token: resetToken, password: 'replacement horse battery staple' })
      .expect(200);
    await agent
      .post('/api/auth/password-reset/confirm')
      .send({ token: resetToken, password: 'another replacement password' })
      .expect(400);
  });

  it('keeps the default registration throttle at five requests per minute', async () => {
    await app.listen(0);
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        request(httpServer)
          .post('/api/auth/register')
          .send({
            email: `rate-limited-${index}@example.com`,
            password: 'correct horse battery staple',
            displayName: `Rate Limited ${index}`,
          }),
      ),
    );

    expect(responses.filter(({ status }) => status === 201)).toHaveLength(5);
    expect(responses.filter(({ status }) => status === 429)).toHaveLength(1);
  });

  it('rejects invalid credentials and protects story routes', async () => {
    await request(httpServer).get('/api/stories').expect(401);
    await request(httpServer)
      .post('/api/auth/register')
      .send({ email: 'invalid', password: 'short', displayName: 'Invalid' })
      .expect(400);
    const invalidCredentials = await request(httpServer)
      .post('/api/auth/login')
      .send({ email: 'missing@example.com', password: 'wrong password' })
      .expect(401);
    expect(invalidCredentials.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns one conflict when the same email is registered concurrently', async () => {
    const attempts = await Promise.all([
      request(httpServer).post('/api/auth/register').send({
        email: 'same@example.com',
        password: 'correct horse battery staple',
        displayName: 'Same One',
      }),
      request(httpServer).post('/api/auth/register').send({
        email: 'same@example.com',
        password: 'correct horse battery staple',
        displayName: 'Same Two',
      }),
    ]);

    expect(attempts.map(({ status }) => status).sort()).toEqual([201, 409]);
  });

  function tokenFromLastEmail() {
    const text = sentMessages.at(-1)?.text ?? '';
    const token = text.match(/[?&]token=([^\s&]+)/u)?.[1];
    if (!token) throw new Error('Expected an account action token in the email');
    return decodeURIComponent(token);
  }
});
