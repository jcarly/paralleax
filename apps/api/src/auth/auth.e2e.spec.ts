import 'reflect-metadata';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { AuthRepository, type AuthUser } from './auth.repository';
import { DatabaseMigrator } from '../database/database.migrator';
import { InMemoryStoriesRepository } from '../stories/stories.repository.memory';
import { StoriesRepository } from '../stories/stories.repository';

describe('Auth API', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];

  beforeEach(async () => {
    const users = new Map<string, AuthUser>();
    const sessions = new Map<string, { userId: string; expiresAt: string }>();
    const authRepository = {
      findUserByEmail: (email: string) => Promise.resolve(users.get(email)),
      createUser: (user: Omit<AuthUser, 'role'>) => {
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
      deleteExpiredSessions: () => {
        const now = new Date();
        for (const [tokenHash, session] of sessions) {
          if (new Date(session.expiresAt) <= now) sessions.delete(tokenHash);
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
        });
      },
      claimMigratedStories: () => Promise.resolve(0),
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AuthRepository)
      .useValue(authRepository)
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

  it('registers, restores the cookie session, and logs out', async () => {
    const agent = request.agent(httpServer);
    const registered = await agent
      .post('/api/auth/register')
      .send({
        email: 'Author@Example.com',
        password: 'correct horse battery staple',
        displayName: 'Alice Author',
      })
      .expect(201);
    expect(registered.body).toMatchObject({
      email: 'author@example.com',
      displayName: 'Alice Author',
    });
    expect(registered.headers['set-cookie']?.[0]).toContain('HttpOnly');

    await agent
      .get('/api/auth/me')
      .expect(200)
      .expect(({ body }) => {
        expect(body.email).toBe('author@example.com');
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
    await request(httpServer)
      .post('/api/auth/login')
      .send({ email: 'missing@example.com', password: 'wrong password' })
      .expect(401);
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
});
