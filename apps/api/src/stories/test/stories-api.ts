import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { importChoiceScript, importQsp } from '@paralleax/shared';
import { AppModule } from '../../app.module';
import { AuthService } from '../../auth/auth.service';
import { DatabaseConnection } from '../../database/database.connection';
import { DatabaseMigrator } from '../../database/database.migrator';
import type { PostgresTestUser } from '../../database/postgres-test-database';
import { ImportReportWriter } from '../../imports/import-report-writer';
import { LocalImportReportStorage } from '../../imports/import-report-storage';
import { ApiExceptionFilter } from '../../operations/api-exception.filter';
import { configureRequestBodyParsing } from '../../operations/request-body';
import { requestContextMiddleware } from '../../operations/request-context';
import { ChoiceScriptImportWorkerService } from '../application/choicescript-import-worker.service';
import { QspImportWorkerService } from '../application/qsp-import-worker.service';
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
    run: jest.fn(async (...args: Parameters<QspImportWorkerService['run']>) => {
      const source = args[0];
      const reportPath = args[3];
      if (reportPath === undefined || reportPath === '') {
        throw new Error('A test QSP report path is required.');
      }
      const writer = new ImportReportWriter({ reportPath });
      await writer.start();
      try {
        return importQsp(source, {
          storyId: randomUUID(),
          timestamp: new Date().toISOString(),
          createId: randomUUID,
          maxPreviewIssues: 0,
          onIssue: (issue) => {
            writer.writeIssue(issue);
          },
          onProgress: args[1],
        });
      } finally {
        await writer.close();
      }
    }),
  };
}
function createChoiceScriptImportWorkerMock() {
  return {
    run: jest.fn(async (...args: Parameters<ChoiceScriptImportWorkerService['run']>) => {
      const [files, options, , reportPath] = args;
      if (reportPath === undefined || reportPath === '') {
        throw new Error('A test ChoiceScript report path is required.');
      }
      const writer = new ImportReportWriter({ reportPath });
      await writer.start();
      try {
        return importChoiceScript(files, {
          ...options,
          createId: randomUUID,
          maxPreviewIssues: 0,
          onIssue: (issue) => {
            writer.writeIssue(issue);
          },
        });
      } finally {
        await writer.close();
      }
    }),
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

function createStoriesTestingModule(reportPath: string, options: StoriesApiOptions) {
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(QspImportWorkerService)
    .useValue(createQspImportWorkerMock())
    .overrideProvider(ChoiceScriptImportWorkerService)
    .useValue(createChoiceScriptImportWorkerMock())
    .overrideProvider(LocalImportReportStorage)
    .useValue(new LocalImportReportStorage(reportPath))
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
  const reportDirectory = await mkdtemp(join(tmpdir(), 'paralleax-import-api-'));
  const moduleFixture = await createStoriesTestingModule(reportDirectory, options);
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
      await rm(reportDirectory, { recursive: true, force: true });
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
