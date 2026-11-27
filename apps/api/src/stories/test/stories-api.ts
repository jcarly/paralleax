import { randomUUID } from 'node:crypto';
import { Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { importChoiceScript, importQsp } from '@paralleax/shared';
import { AppModule } from '../../app.module';
import { AuthService } from '../../auth/auth.service';
import { DatabaseConnection } from '../../database/database.connection';
import { DatabaseMigrator } from '../../database/database.migrator';
import type { PostgresTestUser } from '../../database/postgres-test-database';
import { ApiExceptionFilter } from '../../operations/api-exception.filter';
import { configureRequestBodyParsing } from '../../operations/request-body';
import { requestContextMiddleware } from '../../operations/request-context';
import { ChoiceScriptImportWorkerService } from '../application/choicescript-import-worker.service';
import { QspImportWorkerService } from '../application/qsp-import-worker.service';
import { ImportIssuePreview } from '../application/import-issue-preview';
import { StoriesRepository } from '../stories.repository';

/**
 * Boots the complete Nest application for Stories API specs. Persistence is
 * either the real PostgreSQL repository (pass `database`) or a per-spec stub
 * (pass `storiesRepository`) for boundary specs that must never reach storage.
 */

export type ApiHttpServer = Server<typeof IncomingMessage, typeof ServerResponse>;

export interface StoriesApiOptions {
  database?: DatabaseConnection;
  storiesRepository?: object;
}

export interface StoriesApi {
  app: INestApplication;
  httpServer: ApiHttpServer;
  close(): Promise<void>;
}

/** Session tokens accepted by the mocked AuthService, mapped to their accounts. */
const testAccounts: Record<string, { id: string; role: 'user' | 'admin' }> = {
  'test-user': { id: 'test-user', role: 'user' },
  'user-one': { id: 'user-1', role: 'user' },
  'user-two': { id: 'user-2', role: 'user' },
  admin: { id: 'admin-1', role: 'admin' },
};

/** The accounts a PostgreSQL-backed spec must insert before authenticating as them. */
export const storiesApiTestUsers: readonly PostgresTestUser[] = [
  { id: 'test-user', email: 'test@paralleax.invalid' },
  { id: 'user-1', email: 'user-one@paralleax.invalid', displayName: 'User One' },
  { id: 'user-2', email: 'user-two@paralleax.invalid', displayName: 'User Two' },
  { id: 'admin-1', email: 'admin@paralleax.invalid', role: 'admin' },
];

function createQspImportWorkerMock() {
  return {
    run: jest.fn(
      async (
        source: Parameters<QspImportWorkerService['run']>[0],
        onProgress?: Parameters<QspImportWorkerService['run']>[1],
      ) => {
        const preview = new ImportIssuePreview();
        const result = importQsp(source, {
          storyId: randomUUID(),
          timestamp: new Date().toISOString(),
          createId: randomUUID,
          maxPreviewIssues: 0,
          onIssue: preview.capture,
          onProgress,
        });
        result.report.issues = preview.snapshot();
        return result;
      },
    ),
  };
}
function createChoiceScriptImportWorkerMock() {
  return {
    run: jest.fn(
      async (
        files: Parameters<ChoiceScriptImportWorkerService['run']>[0],
        options: Parameters<ChoiceScriptImportWorkerService['run']>[1],
      ) => {
        const preview = new ImportIssuePreview();
        const result = importChoiceScript(files, {
          ...options,
          createId: randomUUID,
          maxPreviewIssues: 0,
          onIssue: preview.capture,
        });
        result.report.issues = preview.snapshot();
        return result;
      },
    ),
  };
}

function userForTestToken(token?: string) {
  if (token === 'anonymous') {
    return Promise.resolve(undefined);
  }
  const account = testAccounts[token ?? 'test-user'] ?? testAccounts['test-user'];
  return Promise.resolve({
    id: account.id,
    email: `${token ?? 'test'}@paralleax.invalid`,
    role: account.role,
    createdAt: '2026-01-01T00:00:00.000Z',
  });
}

function createStoriesTestingModule(options: StoriesApiOptions) {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(QspImportWorkerService)
    .useValue(createQspImportWorkerMock())
    .overrideProvider(ChoiceScriptImportWorkerService)
    .useValue(createChoiceScriptImportWorkerMock())
    .overrideProvider(DatabaseMigrator)
    .useValue({ run: jest.fn().mockResolvedValue(undefined) })
    .overrideProvider(AuthService)
    .useValue({ userForToken: jest.fn(userForTestToken) });
  if (options.database !== undefined) {
    builder = builder.overrideProvider(DatabaseConnection).useValue(options.database);
  }
  if (options.storiesRepository !== undefined) {
    builder = builder.overrideProvider(StoriesRepository).useValue(options.storiesRepository);
  }
  return builder.compile();
}

function isHttpServer(value: unknown): value is ApiHttpServer {
  return value instanceof Server;
}

/** Starts the API with the same global pipes, filters and prefix as production. */
export async function startStoriesApi(options: StoriesApiOptions): Promise<StoriesApi> {
  const moduleFixture = await createStoriesTestingModule(options);
  const app = moduleFixture.createNestApplication({ bodyParser: false });
  configureRequestBodyParsing(app);
  app.use(requestContextMiddleware);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.setGlobalPrefix('api');
  await app.init();
  const server: unknown = app.getHttpServer() as unknown;
  if (!isHttpServer(server)) {
    throw new Error('The Nest application did not create an HTTP server.');
  }
  return {
    app,
    httpServer: server,
    async close() {
      await app.close();
    },
  };
}

/** Status-asserting request shortcuts bound to the current spec server. */
export function apiRequests(server: () => ApiHttpServer) {
  return {
    getApi: (path: string, status = 200) => request(server()).get(path).expect(status),
    postApi: (path: string, body: object, status = 201) =>
      request(server()).post(path).send(body).expect(status),
    patchApi: (path: string, body: object, status = 200) =>
      request(server()).patch(path).send(body).expect(status),
    deleteApi: (path: string, status = 200) => request(server()).delete(path).expect(status),
  };
}
