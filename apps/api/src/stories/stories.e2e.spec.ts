import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import type { Story } from '@paralleax/shared';
import {
  defaultStoryAccess,
  importChoiceScript,
  importQsp,
  MAX_INTERACTION_BODY_LENGTH,
  serializeQspLocationBundle,
} from '@paralleax/shared';
import { AppModule } from '../app.module';
import { AuthService } from '../auth/auth.service';
import { DatabaseMigrator } from '../database/database.migrator';
import { InMemoryStoriesRepository } from './stories.repository.memory';
import { StoriesRepository } from './stories.repository';
import { STORY_MUTATION_RATE_LIMIT } from './stories.controller';
import { StoryEventsService } from './story.events';
import { QspImportWorkerService } from './application/qsp-import-worker.service';
import { ChoiceScriptImportWorkerService } from './application/choicescript-import-worker.service';
import { ImportReportWriter } from '../imports/import-report-writer';
import { LocalImportReportStorage } from '../imports/import-report-storage';
import { ApiExceptionFilter } from '../operations/api-exception.filter';
import { configureRequestBodyParsing } from '../operations/request-body';
import { requestContextMiddleware } from '../operations/request-context';
type ApiJsonValue = string | number | boolean | null | ApiJsonObject | ApiJsonValue[];
interface ApiJsonObject {
  [key: string]: ApiJsonValue | undefined;
  id?: string;
  title?: string;
  name?: string;
  code?: string;
  message?: string | string[];
  importId?: string;
  status?: string | number;
  category?: string;
  imageUrl?: string | null;
  updatedAt?: string;
  createdAt?: string;
  startDateTime?: string;
  parentGroupId?: string | null;
  groupId?: string;
  interactionId?: string;
  triggerId?: string;
  characterId?: string;
  statId?: string;
  itemId?: string;
  statDefinitionId?: string;
  itemDefinitionId?: string;
  parentItemId?: string;
  locationId?: string;
  revision?: number;
  totalCount?: number;
  page?: number;
  pageSize?: number;
  warningCount?: number;
  errorCount?: number;
  sourceFileCount?: number;
  locationCount?: number;
  initialValue?: ApiJsonValue;
  changePerHour?: number | null;
  durationMinutes?: number;
  timerSeconds?: number | null;
  attempted?: number;
  hasMore?: boolean;
  canRead?: boolean;
  canEdit?: boolean;
  canManage?: boolean;
  isPlayable?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  triggerRemoved?: boolean;
  isOwned?: boolean;
  story?: ApiJsonObject;
  group?: ApiJsonObject;
  interaction?: ApiJsonObject;
  decoration?: ApiJsonObject;
  trigger?: ApiJsonObject;
  location?: ApiJsonObject | string | null;
  character?: ApiJsonObject;
  statDefinition?: ApiJsonObject;
  itemDefinition?: ApiJsonObject;
  stat?: ApiJsonObject;
  item?: ApiJsonObject;
  report?: ApiJsonObject;
  state?: ApiJsonObject;
  history?: ApiJsonObject;
  details?: ApiJsonObject;
  capabilities?: ApiJsonObject;
  owner?: ApiJsonObject;
  access?: ApiJsonObject;
  position?: ApiJsonObject;
  stats?: ApiJsonObject[];
  items?: ApiJsonObject[];
  groups?: ApiJsonObject[];
  interactions?: ApiJsonObject[];
  characters?: ApiJsonObject[];
  locations?: ApiJsonObject[];
  statDefinitions?: ApiJsonObject[];
  itemDefinitions?: ApiJsonObject[];
  graphDecorations?: ApiJsonObject[];
  triggers?: ApiJsonObject[];
  entries?: ApiJsonObject[];
  conditionGroups?: ApiJsonObject[];
  collaborators?: ApiJsonObject[];
  issues?: ApiJsonObject[];
  optionInteractionIds?: string[];
  interactionIds?: string[];
  characterIds?: string[];
  inputInteractionIds?: string[];
  statEffects?: ApiJsonObject[];
  itemEffects?: ApiJsonObject[];
  conditionalTextBlocks?: ApiJsonObject[];
  conditions?: ApiJsonObject[];
  coverage?: ApiJsonObject[];
  contextCounts?: Record<string, number>;
}
const stringFields = new Set([
  'id',
  'title',
  'name',
  'code',
  'message',
  'importId',
  'status',
  'category',
  'updatedAt',
  'createdAt',
  'startDateTime',
  'groupId',
  'interactionId',
  'triggerId',
  'characterId',
  'statId',
  'itemId',
  'statDefinitionId',
  'itemDefinitionId',
  'parentItemId',
  'locationId',
]);
const numberFields = new Set([
  'revision',
  'totalCount',
  'page',
  'pageSize',
  'warningCount',
  'errorCount',
  'sourceFileCount',
  'locationCount',
  'durationMinutes',
  'attempted',
]);
const booleanFields = new Set([
  'hasMore',
  'canRead',
  'canEdit',
  'canManage',
  'isPlayable',
  'canUndo',
  'canRedo',
  'triggerRemoved',
  'isOwned',
]);
const objectFields = new Set([
  'story',
  'group',
  'interaction',
  'decoration',
  'trigger',
  'location',
  'character',
  'statDefinition',
  'itemDefinition',
  'stat',
  'item',
  'report',
  'state',
  'history',
  'details',
  'capabilities',
  'owner',
  'access',
  'position',
  'contextCounts',
]);
const objectArrayFields = new Set([
  'stats',
  'items',
  'groups',
  'interactions',
  'characters',
  'locations',
  'statDefinitions',
  'itemDefinitions',
  'graphDecorations',
  'triggers',
  'entries',
  'conditionGroups',
  'collaborators',
  'issues',
  'statEffects',
  'itemEffects',
  'conditionalTextBlocks',
  'conditions',
  'coverage',
]);
const stringArrayFields = new Set([
  'optionInteractionIds',
  'interactionIds',
  'characterIds',
  'inputInteractionIds',
]);
const jsonFieldValidators = new Map<string, (value: unknown) => boolean>([
  ...[...stringFields].map((key) => [key, (value: unknown) => typeof value === 'string'] as const),
  ...[...numberFields].map((key) => [key, (value: unknown) => typeof value === 'number'] as const),
  ...[...booleanFields].map(
    (key) => [key, (value: unknown) => typeof value === 'boolean'] as const,
  ),
  ...[...objectFields].map((key) => [key, isJsonObject] as const),
  ...[...objectArrayFields].map((key) => [key, isJsonObjectArray] as const),
  ...[...stringArrayFields].map((key) => [key, isStringArray] as const),
  ['imageUrl', isNullableString],
  ['parentGroupId', isNullableString],
  ['changePerHour', isNullableNumber],
  ['timerSeconds', isNullableNumber],
  ['status', (value: unknown) => typeof value === 'string' || typeof value === 'number'],
  ['message', (value: unknown) => typeof value === 'string' || isStringArray(value)],
  [
    'location',
    (value: unknown) => value === null || typeof value === 'string' || isJsonObject(value),
  ],
  ['contextCounts', isNumberRecord],
]);
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}
function isNullableNumber(value: unknown): boolean {
  return value === null || typeof value === 'number';
}
function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
function isNumberRecord(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'number');
}
function isJsonObject(value: unknown): value is ApiJsonObject {
  return isRecord(value) && isApiJsonValue(value);
}
function isJsonObjectArray(value: unknown): boolean {
  return Array.isArray(value) && value.every(isJsonObject);
}
function isValidJsonField(key: string, value: unknown): boolean {
  return jsonFieldValidators.get(key)?.(value) ?? isApiJsonValue(value);
}
function isApiJsonValue(value: unknown): value is ApiJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isApiJsonValue);
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).every(([key, entry]) => isValidJsonField(key, entry));
}
function parseJsonValue(text: string): ApiJsonValue {
  const parsed: unknown = JSON.parse(text) as unknown;
  if (!isApiJsonValue(parsed)) {
    throw new Error('Expected a valid JSON response value.');
  }
  return parsed;
}
function parseResponse(response: { text: string }): ApiJsonObject {
  const parsed = parseJsonValue(response.text);
  if (!isRecord(parsed)) {
    throw new Error('Expected an object-shaped JSON API response.');
  }
  return parsed;
}
function parseResponseArray(response: { text: string }): ApiJsonObject[] {
  const parsed = parseJsonValue(response.text);
  if (!Array.isArray(parsed) || !parsed.every(isJsonObject)) {
    throw new Error('Expected an array of object-shaped JSON API responses.');
  }
  return parsed;
}
let app: INestApplication;
let httpServer: Server<typeof IncomingMessage, typeof ServerResponse>;
let reportDirectory: string;
function isHttpServer(
  value: unknown,
): value is Server<typeof IncomingMessage, typeof ServerResponse> {
  return value instanceof Server;
}
function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}
function requiredString(value: unknown, message: string): string {
  if (typeof value !== 'string') {
    throw new Error(message);
  }
  return value;
}
function requiredJsonObject(value: unknown, message: string): ApiJsonObject {
  if (!isJsonObject(value)) {
    throw new Error(message);
  }
  return value;
}
function responseValueAt(
  root: ApiJsonObject,
  ...path: Array<string | number>
): ApiJsonValue | undefined {
  let current: unknown = root;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) {
        throw new Error(`Expected an array before response index ${segment}.`);
      }
      current = current[segment];
      continue;
    }
    if (!isRecord(current)) {
      throw new Error(`Expected an object before response field ${segment}.`);
    }
    current = current[segment];
  }
  if (current === undefined) {
    return undefined;
  }
  if (!isApiJsonValue(current)) {
    throw new Error('The response path did not contain JSON data.');
  }
  return current;
}
function responseObjectAt(root: ApiJsonObject, ...path: Array<string | number>): ApiJsonObject {
  return requiredJsonObject(responseValueAt(root, ...path), 'Expected a response object.');
}
function responseObjectArrayAt(
  root: ApiJsonObject,
  ...path: Array<string | number>
): ApiJsonObject[] {
  const value = responseValueAt(root, ...path);
  if (!Array.isArray(value) || !value.every(isJsonObject)) {
    throw new Error('Expected an array of response objects.');
  }
  return value;
}
function responseStringArrayAt(root: ApiJsonObject, ...path: Array<string | number>): string[] {
  const value = responseValueAt(root, ...path);
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error('Expected an array of response strings.');
  }
  return value;
}
function responseStringAt(root: ApiJsonObject, ...path: Array<string | number>): string {
  const value = responseValueAt(root, ...path);
  if (typeof value !== 'string') {
    throw new Error('Expected a string response value.');
  }
  return value;
}
function responseNumberAt(root: ApiJsonObject, ...path: Array<string | number>): number {
  const value = responseValueAt(root, ...path);
  if (typeof value !== 'number') {
    throw new Error('Expected a numeric response value.');
  }
  return value;
}
function triggerConditions(trigger: ApiJsonObject): ApiJsonObject[] {
  return (trigger.conditionGroups ?? []).flatMap((group) => group.conditions ?? []);
}
function createQspImportWorkerMock() {
  return {
    run: jest.fn(async (...args: Parameters<QspImportWorkerService['run']>) => {
      const source = args[0];
      const reportPath = args[3];
      if (!reportPath) {
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
          onIssue: (issue) => writer.writeIssue(issue),
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
      if (!reportPath) {
        throw new Error('A test ChoiceScript report path is required.');
      }
      const writer = new ImportReportWriter({ reportPath });
      await writer.start();
      try {
        return importChoiceScript(files, {
          ...options,
          createId: randomUUID,
          maxPreviewIssues: 0,
          onIssue: (issue) => writer.writeIssue(issue),
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
  const ids: Record<string, string> = {
    'user-two': 'user-2',
    'user-one': 'user-1',
    admin: 'admin-1',
  };
  return Promise.resolve({
    id: token ? (ids[token] ?? 'test-user') : 'test-user',
    email: `${token ?? 'test'}@paralleax.invalid`,
    role: token === 'admin' ? 'admin' : 'user',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
}
function createStoriesTestingModule(reportPath: string): Promise<TestingModule> {
  return Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StoriesRepository)
    .useClass(InMemoryStoriesRepository)
    .overrideProvider(QspImportWorkerService)
    .useValue(createQspImportWorkerMock())
    .overrideProvider(ChoiceScriptImportWorkerService)
    .useValue(createChoiceScriptImportWorkerMock())
    .overrideProvider(LocalImportReportStorage)
    .useValue(new LocalImportReportStorage(reportPath))
    .overrideProvider(DatabaseMigrator)
    .useValue({ run: jest.fn().mockResolvedValue(undefined) })
    .overrideProvider(AuthService)
    .useValue({ userForToken: jest.fn(userForTestToken) })
    .compile();
}
function getApi(path: string, status = 200) {
  return request(httpServer).get(path).expect(status);
}
function postApi(path: string, body: object, status = 201) {
  return request(httpServer).post(path).send(body).expect(status);
}
function patchApi(path: string, body: object, status = 200) {
  return request(httpServer).patch(path).send(body).expect(status);
}
function deleteApi(path: string, status = 200) {
  return request(httpServer).delete(path).expect(status);
}
async function setupStoriesApi(): Promise<void> {
  reportDirectory = await mkdtemp(join(tmpdir(), 'paralleax-import-api-'));
  const moduleFixture = await createStoriesTestingModule(reportDirectory);
  app = moduleFixture.createNestApplication({ bodyParser: false });
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
  httpServer = server;
}
async function teardownStoriesApi(): Promise<void> {
  await app.close();
  await rm(reportDirectory, { recursive: true, force: true });
}
beforeEach(setupStoriesApi);
afterEach(teardownStoriesApi);
async function createStory(title = 'Test story'): Promise<Story> {
  const now = new Date().toISOString();
  const story: Story = {
    id: randomUUID(),
    revision: 1,
    title,
    startDateTime: now.slice(0, 16),
    locations: [],
    characters: [],
    interactions: [],
    access: { ...defaultStoryAccess },
    createdAt: now,
    updatedAt: now,
  };
  // Most endpoint tests need an empty graph fixture; the POST contract is tested separately.
  await app.get(StoriesRepository).save(story, 'test-user');
  return story;
}
async function createInteraction(
  storyId: string,
  input: Record<string, unknown> = {},
): Promise<Story> {
  await postApi(`/api/stories/${storyId}/interactions`, input, 201);
  const response = await getApi(`/api/stories/${storyId}`, 200);
  parseResponse(response);
  const story = await app.get(StoriesRepository).find(storyId, 'test-user');
  return required(story, `Story ${storyId} was not persisted.`);
}
it('GET /api/stories lists stories', async () => {
  const response = await getApi('/api/stories', 200);
  expect(parseResponse(response)).toEqual({
    items: [],
    page: 1,
    pageSize: 24,
    totalCount: 0,
    hasMore: false,
  });
});
interface GroupTransferFixture {
  story: Story;
  interactions: [Story['interactions'][number], Story['interactions'][number]];
  openingGroupId: string;
  rootOnlyGroupId: string;
}

async function createGroupTransferFixture(): Promise<GroupTransferFixture> {
  const story = await createStory('Grouped story');
  const withRoot = await createInteraction(story.id);
  const withChild = await createInteraction(story.id, { parentId: withRoot.interactions[0].id });
  const [root, child] = withChild.interactions;
  const opening = await postApi(`/api/stories/${story.id}/groups`, {
    title: 'Opening',
    interactionIds: [root.id, child.id],
  });
  const rootOnly = await postApi(`/api/stories/${story.id}/groups`, {
    title: 'Root only',
    interactionIds: [root.id],
  });
  return {
    story,
    interactions: [root, child],
    openingGroupId: responseStringAt(parseResponse(opening), 'group', 'id'),
    rootOnlyGroupId: responseStringAt(parseResponse(rootOnly), 'group', 'id'),
  };
}

async function transferGroupInteractions(fixture: GroupTransferFixture): Promise<void> {
  const { story, interactions, openingGroupId, rootOnlyGroupId } = fixture;
  const [root, child] = interactions;
  const reloaded = parseResponse(await getApi(`/api/stories/${story.id}`));
  expect(reloaded.groups).toEqual([
    expect.objectContaining({ title: 'Opening', interactionIds: [child.id] }),
    expect.objectContaining({ title: 'Root only', interactionIds: [root.id] }),
  ]);
  expect(reloaded.interactions).toEqual(interactions);
  await patchApi(`/api/stories/${story.id}/groups/${rootOnlyGroupId}`, {
    parentGroupId: openingGroupId,
  });
  await patchApi(`/api/stories/${story.id}/groups/${openingGroupId}`, {
    interactionIds: [root.id, child.id],
  });
  const transferred = parseResponse(await getApi(`/api/stories/${story.id}`));
  expect(responseStringArrayAt(transferred, 'groups', 0, 'interactionIds')).toEqual([
    root.id,
    child.id,
  ]);
  expect(responseObjectAt(transferred, 'groups', 1)).toMatchObject({
    parentGroupId: openingGroupId,
    interactionIds: [],
  });
}

async function undoGroupTransfer(fixture: GroupTransferFixture): Promise<void> {
  const { story, interactions, openingGroupId } = fixture;
  const [root, child] = interactions;
  const undone = parseResponse(await postApi(`/api/stories/${story.id}/history/undo`, {}));
  expect(responseStringArrayAt(undone, 'story', 'groups', 0, 'interactionIds')).toEqual([child.id]);
  expect(responseObjectAt(undone, 'story', 'groups', 1)).toMatchObject({
    parentGroupId: openingGroupId,
    interactionIds: [root.id],
  });
  await postApi(
    `/api/stories/${story.id}/groups`,
    { title: 'Invalid', interactionIds: ['another-story-interaction'] },
    400,
  );
}

it('creates Groups and transfers Interactions without changing reader structure', async () => {
  const fixture = await createGroupTransferFixture();
  await transferGroupInteractions(fixture);
  await undoGroupTransfer(fixture);
});
interface NestedGroupFixture {
  story: Story;
  otherStory: Story;
  interactionId: string;
  parentGroupId: string;
  childGroupId: string;
}

async function createNestedGroupFixture(): Promise<NestedGroupFixture> {
  const story = await createStory('Groups');
  const otherStory = await createStory('Other');
  const interaction = await createInteraction(story.id);
  const interactionId = interaction.interactions[0].id;
  const parent = await postApi(`/api/stories/${story.id}/groups`, {
    title: 'Parent',
    interactionIds: [interactionId],
  });
  const child = await postApi(`/api/stories/${story.id}/groups`, {
    title: 'Child',
    interactionIds: [interactionId],
  });
  const parentGroupId = responseStringAt(parseResponse(parent), 'group', 'id');
  const childGroupId = responseStringAt(parseResponse(child), 'group', 'id');
  await patchApi(`/api/stories/${story.id}/groups/${childGroupId}`, {
    title: 'Renamed',
    parentGroupId,
    interactionIds: [],
  });
  return { story, otherStory, interactionId, parentGroupId, childGroupId };
}

it('validates nested group cycles, ownership, titles, and duplicate interactions', async () => {
  const { story, otherStory, interactionId, parentGroupId, childGroupId } =
    await createNestedGroupFixture();
  await patchApi(
    `/api/stories/${story.id}/groups/${parentGroupId}`,
    { parentGroupId: childGroupId },
    400,
  );
  await patchApi(`/api/stories/${otherStory.id}/groups/${childGroupId}`, { title: 'Foreign' }, 404);
  await patchApi(`/api/stories/${story.id}/groups/${childGroupId}`, { title: '  ' }, 400);
  await patchApi(
    `/api/stories/${story.id}/groups/${childGroupId}`,
    { interactionIds: [interactionId, interactionId] },
    400,
  );
  const loaded = parseResponse(await getApi(`/api/stories/${story.id}`));
  expect(responseObjectAt(loaded, 'groups', 1)).toMatchObject({
    title: 'Renamed',
    parentGroupId,
    interactionIds: [],
  });
});

it('deletes a parent group, supports undo, and cleans groups after interaction deletion', async () => {
  const { story, interactionId, parentGroupId, childGroupId } = await createNestedGroupFixture();
  const loaded = parseResponse(await getApi(`/api/stories/${story.id}`));
  const deleted = parseResponse(
    await deleteApi(`/api/stories/${story.id}/groups/${parentGroupId}`),
  );
  expect(deleted.groupId).toBe(parentGroupId);
  expect(
    responseObjectArrayAt(parseResponse(await getApi(`/api/stories/${story.id}`)), 'groups'),
  ).toEqual([{ id: childGroupId, title: 'Renamed', interactionIds: [] }]);
  const undone = parseResponse(await postApi(`/api/stories/${story.id}/history/undo`, {}));
  expect(responseObjectArrayAt(undone, 'story', 'groups')).toEqual(
    responseObjectArrayAt(loaded, 'groups'),
  );
  await deleteApi(`/api/stories/${story.id}/interactions/${interactionId}`);
  const cleaned = parseResponse(await getApi(`/api/stories/${story.id}`));
  expect(responseStringArrayAt(cleaned, 'groups', 0, 'interactionIds')).toEqual([]);
  expect(responseObjectArrayAt(cleaned, 'groups')).toHaveLength(2);
});
it('persists authored Story history and supports undo and redo', async () => {
  const created = await createStory('Original title');
  await patchApi(`/api/stories/${created.id}`, { title: 'Changed title' }, 200);
  const history = await getApi(`/api/stories/${created.id}/history`, 200);
  expect(parseResponse(history)).toMatchObject({
    canUndo: true,
    canRedo: false,
    entries: [{ kind: 'change', revision: 2, reverted: false }],
  });
  const undone = await request(httpServer)
    .post(`/api/stories/${created.id}/history/undo`)
    .expect(201);
  expect(responseObjectAt(parseResponse(undone), 'story')).toMatchObject({
    title: 'Original title',
    revision: 3,
  });
  expect(responseObjectAt(parseResponse(undone), 'history')).toMatchObject({
    canUndo: false,
    canRedo: true,
  });
  const reloadedHistory = await getApi(`/api/stories/${created.id}/history`, 200);
  expect(parseResponse(reloadedHistory)).toMatchObject({ canUndo: false, canRedo: true });
  const redone = await request(httpServer)
    .post(`/api/stories/${created.id}/history/redo`)
    .expect(201);
  expect(responseObjectAt(parseResponse(redone), 'story')).toMatchObject({
    title: 'Changed title',
    revision: 4,
  });
  expect(responseObjectAt(parseResponse(redone), 'history')).toMatchObject({
    canUndo: true,
    canRedo: false,
  });
});
it('refuses to undo over a later overlapping collaborator change', async () => {
  const ownerCookie = 'paralleax_session=user-one';
  const collaboratorCookie = 'paralleax_session=user-two';
  const created = await request(httpServer)
    .post('/api/stories')
    .set('Cookie', ownerCookie)
    .send({ title: 'Original title' })
    .expect(201);
  await request(httpServer)
    .patch(`/api/stories/${responseStringAt(parseResponse(created), 'id')}/access`)
    .set('Cookie', ownerCookie)
    .send({ visibility: 'invitation', editPolicy: 'owner', commentPolicy: 'editors' })
    .expect(200);
  await request(httpServer)
    .post(`/api/stories/${responseStringAt(parseResponse(created), 'id')}/access/collaborators`)
    .set('Cookie', ownerCookie)
    .send({ email: 'user-two@paralleax.invalid', role: 'editor' })
    .expect(201);
  await request(httpServer)
    .patch(`/api/stories/${responseStringAt(parseResponse(created), 'id')}`)
    .set('Cookie', ownerCookie)
    .send({ title: 'Owner title' })
    .expect(200);
  await request(httpServer)
    .patch(`/api/stories/${responseStringAt(parseResponse(created), 'id')}`)
    .set('Cookie', collaboratorCookie)
    .send({ title: 'Collaborator title' })
    .expect(200);
  await request(httpServer)
    .post(`/api/stories/${responseStringAt(parseResponse(created), 'id')}/history/undo`)
    .set('Cookie', ownerCookie)
    .expect(409);
  const current = await request(httpServer)
    .get(`/api/stories/${responseStringAt(parseResponse(created), 'id')}`)
    .set('Cookie', ownerCookie)
    .expect(200);
  expect(responseStringAt(parseResponse(current), 'title')).toBe('Collaborator title');
});
interface GraphMoveScenario {
  story: Story;
  root: Story['interactions'][number];
  child: Story['interactions'][number];
  trigger: Story['interactions'][number]['triggers'][number];
}

async function createGraphMoveScenario(): Promise<GraphMoveScenario> {
  const story = await createStory('Grouped graph move');
  const rootStory = await createInteraction(story.id);
  const root = rootStory.interactions[0];
  const childStory = await createInteraction(story.id, { parentId: root.id });
  const child = childStory.interactions[1];
  return { story, root, child, trigger: child.triggers[0] };
}

async function recordGroupedGraphMove(scenario: GraphMoveScenario): Promise<void> {
  const { story, root, child, trigger } = scenario;
  const before = parseResponse(await getApi(`/api/stories/${story.id}/history`));
  await patchApi(`/api/stories/${story.id}/graph/positions`, {
    interactionUpdates: [
      { interactionId: root.id, position: { x: 300, y: 200 } },
      { interactionId: child.id, position: { x: 300, y: 500 } },
    ],
    triggerUpdates: [
      { interactionId: child.id, triggerIds: [trigger.id], position: { x: 310, y: 360 } },
    ],
  });
  const after = parseResponse(await getApi(`/api/stories/${story.id}/history`));
  expect(responseObjectArrayAt(after, 'entries')).toHaveLength(
    responseObjectArrayAt(before, 'entries').length + 1,
  );
}

async function undoGroupedGraphMove(scenario: GraphMoveScenario): Promise<void> {
  const { story, root, child, trigger } = scenario;
  const undone = parseResponse(await postApi(`/api/stories/${story.id}/history/undo`, {}));
  expect(undone.story).toBeUndefined();
  expect(typeof responseNumberAt(undone, 'revision')).toBe('number');
  expect(undone).toMatchObject({
    storyId: story.id,
    graphPositions: {
      interactionUpdates: [
        { interactionId: root.id, position: root.position },
        { interactionId: child.id, position: child.position },
      ],
      triggerUpdates: [{ interactionId: child.id, triggerIds: [trigger.id] }],
    },
  });
  const restored = parseResponse(await getApi(`/api/stories/${story.id}`));
  expect(responseObjectAt(restored, 'interactions', 0, 'position')).toEqual(root.position);
  expect(responseObjectAt(restored, 'interactions', 1, 'position')).toEqual(child.position);
  expect(responseValueAt(restored, 'interactions', 1, 'triggers', 0, 'position')).toBeUndefined();
}

it('records one reversible history event for a grouped graph position gesture', async () => {
  const scenario = await createGraphMoveScenario();
  await recordGroupedGraphMove(scenario);
  await undoGroupedGraphMove(scenario);
});
it('rate-limits story mutations independently from reads', async () => {
  // Keep Supertest from owning and closing the shared server while concurrent requests are active.
  await app.listen(0);
  const responses = await Promise.all(
    Array.from({ length: STORY_MUTATION_RATE_LIMIT + 1 }, (_, index) =>
      request(httpServer)
        .post('/api/stories')
        .send({ title: `Story ${index}` }),
    ),
  );
  expect(responses.filter(({ status }) => status === 201)).toHaveLength(STORY_MUTATION_RATE_LIMIT);
  expect(responses.filter(({ status }) => status === 429)).toHaveLength(1);
  await getApi('/api/stories', 200);
});
it('POST /api/stories creates a story', async () => {
  const response = await postApi('/api/stories', { title: 'New API story' }, 201);
  expect(parseResponse(response)).toMatchObject({
    title: 'New API story',
    access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
    interactions: [
      {
        title: '',
        body: '',
        position: { x: 80, y: 120 },
        triggers: [{ inputInteractionIds: [], conditionGroups: [{ conditions: [] }] }],
      },
      {
        title: '',
        body: '',
        position: { x: 80, y: 252 },
        triggers: [{ conditionGroups: [{ conditions: [] }] }],
      },
    ],
  });
});
it('POST /api/stories requires a non-null title', async () => {
  await postApi('/api/stories', {}, 400);
  await postApi('/api/stories', { title: null }, 400);
  await postApi('/api/stories', { title: '' }, 400);
  await postApi('/api/stories', { title: 'x'.repeat(201) }, 400);
});
it('POST /api/stories/demo is admin-only and creates the populated demo catalog', async () => {
  await request(httpServer)
    .post('/api/stories/demo')
    .set('Cookie', 'paralleax_session=user-one')
    .send({})
    .expect(403);
  const response = await request(httpServer)
    .post('/api/stories/demo')
    .set('Cookie', 'paralleax_session=admin')
    .send({})
    .expect(201);
  const stories = parseResponseArray(response);
  expect(stories.map(({ title }) => title)).toEqual([
    'Demo 1: paths only',
    'Demo 2: visited interaction conditions',
    'Demo 3: world variables',
    'Demo 4: character stats and simple items',
    'Demo 5: body, equipment, and item stats',
  ]);
  expect(stories.every((story) => typeof story.id === 'string')).toBe(true);
  expect(stories[2].stats).toHaveLength(3);
  expect(
    required(stories[3].characters?.[0], 'Expected this response value to be present.').items,
  ).toHaveLength(2);
  const equippedItems = required(
    required(stories[4].characters?.[0], 'Expected this response value to be present.').items,
    'Expected this response value to be present.',
  );
  expect(equippedItems.some((item) => item.relationshipType === 'equipped')).toBe(true);
  const listResponse = await request(httpServer)
    .get('/api/stories')
    .set('Cookie', 'paralleax_session=admin')
    .expect(200);
  for (const story of stories) {
    expect(responseObjectArrayAt(parseResponse(listResponse), 'items')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: story.id,
          interactionCount: required(
            story.interactions,
            'Expected this response value to be present.',
          ).length,
        }),
      ]),
    );
  }
});
const choicescriptStartup = `*title Imported mystery
An envelope waits on the table.
*choice
  #Open it
    A key falls out.
    *goto ending
  #Leave it
    You walk away.
    *goto ending
*label ending
Night falls.
*ending`;
function choicescriptImportBody() {
  return { files: [{ name: 'startup.txt', content: choicescriptStartup }] };
}

it('POST /api/stories/imports/choicescript creates a complete story atomically', async () => {
  const response = await postApi('/api/stories/imports/choicescript', choicescriptImportBody());
  expect(typeof responseStringAt(parseResponse(response), 'story', 'id')).toBe('string');
  expect(responseObjectAt(parseResponse(response), 'story')).toMatchObject({
    title: 'Imported mystery',
    interactionCount: 4,
    access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
  });
  expect(responseStringAt(parseResponse(response), 'status')).toBe('imported');
  expect(responseObjectAt(parseResponse(response), 'story')).not.toHaveProperty('interactions');
  const importedStory = await getApi(
    `/api/stories/${responseStringAt(parseResponse(response), 'story', 'id')}`,
    200,
  );
  expect(responseObjectArrayAt(parseResponse(importedStory), 'interactions')).toHaveLength(4);
  expect(responseObjectAt(parseResponse(response), 'report')).toMatchObject({
    format: 'choicescript',
    sourceFileCount: 1,
    sceneCount: 1,
    interactionCount: 4,
  });
  expect(responseStringAt(parseResponse(response), 'importId')).toEqual(expect.any(String));
  const listResponse = await getApi('/api/stories', 200);
  expect(responseObjectArrayAt(parseResponse(listResponse), 'items')).toHaveLength(1);
  expect(responseObjectAt(parseResponse(listResponse), 'items', 0)).toMatchObject({
    id: responseStringAt(parseResponse(response), 'story', 'id'),
    interactionCount: 4,
  });
});
it('writes ChoiceScript warnings to the downloadable JSONL report', async () => {
  const response = await postApi(
    '/api/stories/imports/choicescript',
    { files: [{ name: 'chapter.txt', content: 'A chapter begins.' }] },
    201,
  );
  expect(parseResponse(response)).toMatchObject({
    status: 'confirmation_required',
    report: { format: 'choicescript', warningCount: 1, errorCount: 0, issues: [] },
  });
  const report = await getApi(
    `/api/imports/${responseStringAt(parseResponse(response), 'importId')}/report`,
    200,
  );
  expect(report.text).toContain('missing_startup_scene');
  expect(responseObjectArrayAt(parseResponse(await getApi('/api/stories', 200)), 'items')).toEqual(
    [],
  );
});
it('validates ChoiceScript import files and rejects unresolved flow', async () => {
  await postApi(
    '/api/stories/imports/choicescript',
    { files: [{ name: 'startup.cs', content: 'Invalid extension.' }] },
    400,
  );
  await postApi(
    '/api/stories/imports/choicescript',
    { files: [{ name: 'startup.txt', content: 'Start.\n*goto absent' }] },
    400,
  );
  await postApi(
    '/api/stories/imports/choicescript',
    {
      files: [
        { name: 'startup.txt', content: 'a'.repeat(50000) },
        { name: 'ending.txt', content: 'b'.repeat(50000) },
      ],
    },
    400,
  );
  const listResponse = await getApi('/api/stories', 200);
  expect(responseObjectArrayAt(parseResponse(listResponse), 'items')).toEqual([]);
});
const qspCompatibilitySource = `# Start
*pl 'A corridor stretches ahead.'
score[2] = 2
if score[2] >= 3:
  act 'Wait': goto 'Ending'
elseif score[2] >= 2:
  act 'Continue': goto 'Ending'
else:
  act 'Stop': goto 'Ending'
end
unknown_command
--- Start ---
# Ending
*pl 'The end.'
--- Ending ---`;
function qspCompatibilityRequest() {
  return {
    file: {
      name: 'corridor.qsps',
      format: 'text',
      contentBase64: Buffer.from(qspCompatibilitySource, 'utf8').toString('base64'),
    },
  };
}

async function expectQspReportDownload(
  preview: ApiJsonObject,
  importId: string,
  reportBody: ApiJsonObject,
): Promise<void> {
  const report = await request(httpServer)
    .get(`/api/imports/${importId}/report`)
    .expect(200)
    .expect('content-type', /application\/x-ndjson/)
    .expect('content-disposition', new RegExp(`attachment; filename="${importId}\\.jsonl"`));
  const issues = report.text
    .split('\n')
    .filter(Boolean)
    .map((line) => parseJsonValue(line));
  expect(issues).toHaveLength(
    responseNumberAt(preview, 'report', 'warningCount') +
      responseNumberAt(preview, 'report', 'errorCount'),
  );
  expect(issues).toEqual(
    expect.arrayContaining([expect.objectContaining({ severity: 'warning' })]),
  );
  expect(reportBody).toMatchObject({ errorCount: 0, issues: [] });
}

it('previews QSP compatibility warnings and serves the downloadable report', async () => {
  const preview = await postApi('/api/stories/imports/qsp', qspCompatibilityRequest());
  const previewBody = parseResponse(preview);
  const reportBody = responseObjectAt(previewBody, 'report');
  const importId = responseStringAt(previewBody, 'importId');
  expect(previewBody.status).toBe('confirmation_required');
  expect(previewBody.story).toBeUndefined();
  expect(typeof reportBody.warningCount).toBe('number');
  expect(responseNumberAt(previewBody, 'report', 'warningCount')).toBeGreaterThan(0);
  await expectQspReportDownload(previewBody, importId, reportBody);
  await request(httpServer)
    .get(`/api/imports/${importId}/report`)
    .set('Cookie', 'paralleax_session=user-two')
    .expect(403);
  await getApi('/api/imports/not-a-uuid/report', 400);
  await getApi(`/api/imports/${randomUUID()}/report`, 404);
  expect(responseObjectArrayAt(parseResponse(await getApi('/api/stories')), 'items')).toEqual([]);
});

function expectImportedQspStory(story: ApiJsonObject, storyId: string): void {
  const interactions = responseObjectArrayAt(story, 'interactions');
  expect(interactions.map((interaction) => responseStringAt(interaction, 'title'))).toEqual([
    'Start',
    'Wait',
    'Continue',
    'Stop',
    'Ending',
  ]);
  expect(responseObjectArrayAt(story, 'statDefinitions')).toEqual([
    expect.objectContaining({ name: 'Score [2]', valueType: 'number', category: 'QSP' }),
  ]);
  expect(responseObjectArrayAt(story, 'interactions', 0, 'statEffects')).toEqual([
    expect.objectContaining({ operation: 'set', value: 2 }),
  ]);
  for (const [interactionIndex, conditions] of [
    [
      2,
      [
        { operator: 'lt', value: 3 },
        { operator: 'gte', value: 2 },
      ],
    ],
    [
      3,
      [
        { operator: 'lt', value: 3 },
        { operator: 'lt', value: 2 },
      ],
    ],
  ] as const) {
    const actual = responseObjectArrayAt(
      story,
      'interactions',
      interactionIndex,
      'triggers',
      0,
      'conditionGroups',
      0,
      'conditions',
    );
    expect(actual).toHaveLength(conditions.length);
    conditions.forEach(({ operator, value }, index) => {
      expect(actual[index]).toMatchObject({ operator, value });
    });
  }
  expect(story.id).toBe(storyId);
}

it('imports QSP content after warning confirmation with its conditions', async () => {
  const response = await postApi('/api/stories/imports/qsp', {
    ...qspCompatibilityRequest(),
    confirmWarnings: true,
  });
  const imported = parseResponse(response);
  const storyId = responseStringAt(imported, 'story', 'id');
  expect(imported.status).toBe('imported');
  expect(responseObjectAt(imported, 'story')).toMatchObject({
    title: 'corridor',
    interactionCount: 5,
    access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
  });
  expect(responseObjectAt(imported, 'story')).not.toHaveProperty('interactions');
  const story = parseResponse(await getApi(`/api/stories/${storyId}`));
  expectImportedQspStory(story, storyId);
});

it('reports QSP compatibility coverage and lists the imported story', async () => {
  const response = await postApi('/api/stories/imports/qsp', {
    ...qspCompatibilityRequest(),
    confirmWarnings: true,
  });
  const imported = parseResponse(response);
  expect(responseObjectAt(imported, 'report')).toMatchObject({
    format: 'qsp',
    sourceFileCount: 1,
    locationCount: 2,
    actionCount: 3,
    interactionCount: 5,
  });
  expect(responseObjectArrayAt(imported, 'report', 'coverage')).toEqual(
    expect.arrayContaining([expect.objectContaining({ feature: 'variables', support: 'partial' })]),
  );
  const listResponse = await getApi('/api/stories');
  expect(responseObjectArrayAt(parseResponse(listResponse), 'items')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: responseStringAt(imported, 'story', 'id'),
        interactionCount: 5,
      }),
    ]),
  );
});
it('requires QSP warning confirmation when the issue preview is empty', async () => {
  const source = '# Start\nunknown_command\n--- Start ---';
  const response = await postApi(
    '/api/stories/imports/qsp',
    {
      file: {
        name: 'warning-preview.qsps',
        format: 'text',
        contentBase64: Buffer.from(source, 'utf8').toString('base64'),
      },
    },
    201,
  );
  expect(parseResponse(response)).toMatchObject({
    status: 'confirmation_required',
    report: { warningCount: 1, errorCount: 0, issues: [] },
  });
  expect(responseObjectArrayAt(parseResponse(await getApi('/api/stories', 200)), 'items')).toEqual(
    [],
  );
});
it('allows administrators to stream QSP files beyond the standard import limit', async () => {
  const source = `# Start\n*pl 'Large import.'\nunknown_command\n--- Start ---\n${' '.repeat(81 * 1024)}`;
  const path = '/api/stories/imports/qsp/admin?name=large.qsps&format=text';
  await request(httpServer)
    .post(path)
    .set('Cookie', 'paralleax_session=user-one')
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.from(source, 'utf8'))
    .expect(403);
  const preview = await request(httpServer)
    .post(path)
    .set('Cookie', 'paralleax_session=admin')
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.from(source, 'utf8'))
    .expect(201);
  expect(responseStringAt(parseResponse(preview), 'status')).toBe('confirmation_required');
  expect(parseResponse(preview).story).toBeUndefined();
  const response = await request(httpServer)
    .post(`${path}&confirmWarnings=true`)
    .set('Cookie', 'paralleax_session=admin')
    .set('Content-Type', 'application/octet-stream')
    .send(Buffer.from(source, 'utf8'))
    .expect(201);
  expect(responseStringAt(parseResponse(response), 'status')).toBe('imported');
  expect(typeof responseStringAt(parseResponse(response), 'story', 'id')).toBe('string');
  expect(responseObjectAt(parseResponse(response), 'story')).toMatchObject({
    title: 'large',
    interactionCount: 1,
  });
  expect(responseObjectAt(parseResponse(response), 'story')).not.toHaveProperty('interactions');
  expect(responseObjectAt(parseResponse(response), 'report')).toMatchObject({
    format: 'qsp',
    sourceFileCount: 1,
    locationCount: 1,
  });
});
it('imports a collection of qsrc location files through the existing QSP endpoint', async () => {
  const bundle = serializeQspLocationBundle([
    { name: 'locations/ending.qsrc', content: "# Ending\n'Done.'\n--- Ending ---" },
    {
      name: 'locations/start.qsrc',
      content:
        "# start\nif $ARGS[0] = '':\n  gt 'start', 'menu'\nend\nif $ARGS[0] = 'menu':\n  act 'Finish': gt 'Ending'\nend\n--- start ---",
    },
  ]);
  const response = await postApi(
    '/api/stories/imports/qsp',
    {
      file: {
        name: 'locations.qsrc',
        format: 'locations',
        contentBase64: Buffer.from(bundle, 'utf8').toString('base64'),
      },
      confirmWarnings: true,
    },
    201,
  );
  expect(responseObjectAt(parseResponse(response), 'story')).toMatchObject({ interactionCount: 4 });
  expect(responseObjectAt(parseResponse(response), 'story')).not.toHaveProperty('interactions');
  const importedStory = await getApi(
    `/api/stories/${responseStringAt(parseResponse(response), 'story', 'id')}`,
    200,
  );
  expect(
    responseObjectArrayAt(parseResponse(importedStory), 'interactions').map((interaction) =>
      required(interaction.title, 'The interaction title is missing.'),
    ),
  ).toEqual(['start', 'start · menu', 'Finish', 'Ending']);
  expect(responseObjectAt(parseResponse(response), 'report')).toMatchObject({
    sourceFileCount: 2,
    locationCount: 2,
  });
});
it('keeps the QSP size limit on the standard import route', async () => {
  const response = await postApi(
    '/api/stories/imports/qsp',
    {
      file: {
        name: 'large.qsps',
        format: 'text',
        contentBase64: Buffer.alloc(80 * 1024 + 1, 32).toString('base64'),
      },
    },
    400,
  );
  expect(responseStringAt(parseResponse(response), 'code')).toBe('QSP_IMPORT_TOO_LARGE');
});
it('validates QSP format metadata and rejects unresolved locations atomically', async () => {
  await postApi(
    '/api/stories/imports/qsp',
    {
      file: {
        name: 'invalid.qsp',
        format: 'text',
        contentBase64: Buffer.from('# Start\n---', 'utf8').toString('base64'),
      },
    },
    400,
  );
  const unresolved = await postApi(
    '/api/stories/imports/qsp',
    {
      file: {
        name: 'unresolved.qsps',
        format: 'text',
        contentBase64: Buffer.from("# Start\ngoto 'Missing'\n---", 'utf8').toString('base64'),
      },
    },
    400,
  );
  expect(responseStringAt(parseResponse(unresolved), 'code')).toBe('STORY_IMPORT_FAILED');
  expect(responseObjectAt(parseResponse(unresolved), 'details', 'report')).toMatchObject({
    format: 'qsp',
  });
  expect(responseObjectAt(parseResponse(unresolved), 'details', 'report')).toMatchObject({
    errorCount: 1,
    issues: [],
  });
  const report = await getApi(
    `/api/imports/${responseStringAt(parseResponse(unresolved), 'details', 'importId')}/report`,
    200,
  );
  expect(report.text).toContain('missing_location_target');
  const listResponse = await getApi('/api/stories', 200);
  expect(responseObjectArrayAt(parseResponse(listResponse), 'items')).toEqual([]);
});
it('GET /api/stories/:storyId returns a story', async () => {
  const story = await createStory('Story to read');
  const response = await getApi(`/api/stories/${story.id}`, 200);
  expect(parseResponse(response)).toMatchObject({
    id: story.id,
    title: 'Story to read',
  });
});
type RuntimeContextFixture = {
  storyId: string;
  rootId: string;
  childId: string;
  contextualId: string;
};

async function createRuntimeContextFixture(): Promise<RuntimeContextFixture> {
  const story = await createStory('Runtime slices');
  await request(httpServer)
    .get(`/api/stories/${story.id}/runtime/context?page=1&pageSize=1`)
    .set('Cookie', 'paralleax_session=anonymous')
    .expect(404);
  const withRoot = await createInteraction(story.id);
  const root = withRoot.interactions[0];
  const withChild = await createInteraction(story.id, { parentId: root.id });
  const child = required(
    withChild.interactions.find(({ id }) => id !== root.id),
    'The child interaction was not returned.',
  );
  const withContextual = await createInteraction(story.id);
  const contextual = required(
    withContextual.interactions.find(({ id }) => id !== root.id && id !== child.id),
    'The contextual interaction was not returned.',
  );
  await patchApi(
    `/api/stories/${story.id}/interactions/${contextual.id}/triggers/${contextual.triggers[0].id}`,
    { conditions: [{ interactionId: root.id, hasBeenVisited: true }] },
    200,
  );
  return { storyId: story.id, rootId: root.id, childId: child.id, contextualId: contextual.id };
}

it('loads paginated runtime context and only structurally relevant option triggers', async () => {
  const { storyId, rootId, childId, contextualId } = await createRuntimeContextFixture();
  const bootstrap = await getApi(`/api/stories/${storyId}/runtime`, 200);
  expect(parseResponse(bootstrap)).toMatchObject({ id: storyId, interactionCount: 3 });
  expect(parseResponse(bootstrap)).not.toHaveProperty('interactions');
  const context = await getApi(`/api/stories/${storyId}/runtime/context?page=1&pageSize=1`, 200);
  expect(parseResponse(context)).toMatchObject({ page: 1, pageSize: 1, graphDecorations: [] });
  const firstPage = await postApi(
    `/api/stories/${storyId}/runtime/slice`,
    {
      currentInteractionId: rootId,
      interactionIds: [rootId],
      page: 1,
      pageSize: 1,
    },
    200,
  );
  expect(parseResponse(firstPage)).toMatchObject({ totalOptionCount: 2, hasMore: true });
  expect(responseStringArrayAt(parseResponse(firstPage), 'optionInteractionIds')).toHaveLength(1);
  expect(responseObjectArrayAt(parseResponse(firstPage), 'interactions')).toEqual(
    expect.arrayContaining([expect.objectContaining({ id: rootId, triggers: [] })]),
  );
  const secondPage = await postApi(
    `/api/stories/${storyId}/runtime/slice`,
    {
      currentInteractionId: rootId,
      page: 2,
      pageSize: 1,
    },
    200,
  );
  const optionIds = [
    ...responseStringArrayAt(parseResponse(firstPage), 'optionInteractionIds'),
    ...responseStringArrayAt(parseResponse(secondPage), 'optionInteractionIds'),
  ];
  expect(optionIds).toEqual(expect.arrayContaining([childId, contextualId]));
  expect(optionIds).not.toContain(rootId);
});

it('omits options when requesting a journey-only runtime slice', async () => {
  const { storyId, rootId } = await createRuntimeContextFixture();
  const journeyOnly = await postApi(
    `/api/stories/${storyId}/runtime/slice`,
    {
      currentInteractionId: rootId,
      interactionIds: [rootId],
      includeOptions: false,
      page: 1,
      pageSize: 1,
    },
    200,
  );
  expect(parseResponse(journeyOnly)).toMatchObject({
    totalOptionCount: 0,
    hasMore: false,
    optionInteractionIds: [],
    interactions: [expect.objectContaining({ id: rootId, triggers: [] })],
  });
});

function expectEditorProjectionsStayLightweight(
  interactions: ApiJsonObject,
  triggers: ApiJsonObject,
): void {
  expect(responseObjectAt(interactions, 'interactions', 0)).not.toHaveProperty('body');
  expect(responseObjectAt(interactions, 'interactions', 0)).not.toHaveProperty('triggers');
  expect(responseObjectAt(triggers, 'triggers', 0)).not.toHaveProperty('conditionGroups');
}

it('loads the editor projection in revision-consistent paginated stages', async () => {
  const story = await createStory('Progressive editor');
  const withRoot = await createInteraction(story.id);
  const root = withRoot.interactions[0];
  const withChild = await createInteraction(story.id, { parentId: root.id });
  const child = required(
    withChild.interactions.find(({ id }) => id !== root.id),
    'The child interaction was not returned.',
  );
  await patchApi(
    `/api/stories/${story.id}/interactions/${child.id}`,
    { body: '<p>Deferred body</p>', durationMinutes: 5 },
    200,
  );
  const bootstrap = await getApi(`/api/stories/${story.id}/editor`, 200);
  const interactions = await getApi(
    `/api/stories/${story.id}/editor/interactions?page=1&pageSize=1`,
    200,
  );
  const triggers = await getApi(`/api/stories/${story.id}/editor/triggers?page=1&pageSize=1`, 200);
  const interactionContent = await getApi(
    `/api/stories/${story.id}/editor/content/interactions?page=2&pageSize=1`,
    200,
  );
  const triggerContent = await getApi(
    `/api/stories/${story.id}/editor/content/triggers?page=1&pageSize=1`,
    200,
  );
  expect(parseResponse(bootstrap)).toMatchObject({ interactionCount: 2, triggerCount: 2 });
  expect(parseResponse(interactions)).toMatchObject({
    revision: responseNumberAt(parseResponse(bootstrap), 'revision'),
    page: 1,
    pageSize: 1,
    hasMore: true,
  });
  expectEditorProjectionsStayLightweight(parseResponse(interactions), parseResponse(triggers));
  expect(responseObjectAt(parseResponse(interactionContent), 'interactions', 0)).toMatchObject({
    interactionId: child.id,
    body: '<p>Deferred body</p>',
    durationMinutes: 5,
  });
  expect(responseObjectAt(parseResponse(triggerContent), 'triggers', 0)).toHaveProperty(
    'conditionGroups',
  );
});
it('PATCH /api/stories/:storyId renames a story', async () => {
  const story = await createStory('Old title');
  const response = await patchApi(`/api/stories/${story.id}`, { title: 'Renamed title' }, 200);
  expect(responseStringAt(parseResponse(response), 'title')).toBe('Renamed title');
});
it('updates and validates the story-local start date and time', async () => {
  const story = await createStory('Timed story');
  const response = await patchApi(
    `/api/stories/${story.id}`,
    { startDateTime: '2026-07-27T09:30' },
    200,
  );
  expect(responseStringAt(parseResponse(response), 'startDateTime')).toBe('2026-07-27T09:30');
  await patchApi(`/api/stories/${story.id}`, { startDateTime: '2026-02-30T09:30' }, 400);
});
it('DELETE /api/stories/:storyId deletes a story', async () => {
  const story = await createStory('Story to delete');
  await deleteApi(`/api/stories/${story.id}`, 204);
  await getApi(`/api/stories/${story.id}`, 404);
});

type ReaderProgressFixture = {
  storyId: string;
  rootId: string;
  childId: string;
  statId: string;
  itemId: string;
};

async function createReaderProgressItemsAndStats(
  storyId: string,
  rootId: string,
): Promise<Pick<ReaderProgressFixture, 'statId' | 'itemId'>> {
  const definition = await postApi(`/api/stories/${storyId}/stat-definitions`, { name: 'Trust' });
  const character = await postApi(`/api/stories/${storyId}/characters`, { name: 'Mira' });
  const stat = await postApi(
    `/api/stories/${storyId}/characters/${responseStringAt(parseResponse(character), 'character', 'id')}/stats`,
    {
      statDefinitionId: responseStringAt(parseResponse(definition), 'statDefinition', 'id'),
      initialValue: 1,
    },
  );
  const itemDefinition = await postApi(`/api/stories/${storyId}/item-definitions`, { name: 'Key' });
  const item = await postApi(
    `/api/stories/${storyId}/characters/${responseStringAt(parseResponse(character), 'character', 'id')}/items`,
    { itemDefinitionId: responseStringAt(parseResponse(itemDefinition), 'itemDefinition', 'id') },
  );
  const statId = responseStringAt(parseResponse(stat), 'stat', 'id');
  const itemId = responseStringAt(parseResponse(item), 'item', 'id');
  await patchApi(`/api/stories/${storyId}/interactions/${rootId}`, {
    durationMinutes: 15,
    statEffects: [{ statId, operation: 'add', value: 2 }],
    itemEffects: [{ itemId, operation: 'obtain' }],
  });
  return { statId, itemId };
}

async function createReaderProgressFixture(): Promise<ReaderProgressFixture> {
  const story = await createStory('Progress story');
  await patchApi(`/api/stories/${story.id}`, { startDateTime: '2026-07-27T09:00' });
  const root = (await createInteraction(story.id)).interactions[0];
  const childGraph = await createInteraction(story.id, { parentId: root.id });
  const child = required(
    childGraph.interactions.find(({ id }) => id !== root.id),
    'The child interaction was not returned.',
  );
  const entities = await createReaderProgressItemsAndStats(story.id, root.id);
  return { storyId: story.id, rootId: root.id, childId: child.id, ...entities };
}

function expectReaderProgressState(progress: ApiJsonObject, fixture: ReaderProgressFixture): void {
  const state = responseObjectAt(progress, 'state');
  expect(typeof required(state, 'Expected this response value to be present.').randomSeed).toBe(
    'string',
  );
  expect(required(state, 'Expected this response value to be present.').stepStartedAt).toEqual(
    expect.arrayContaining([expect.any(String)]),
  );
  expect(state).toMatchObject({
    version: 4,
    journeyInteractionIds: [fixture.rootId, fixture.childId, fixture.rootId],
    currentInteractionId: fixture.rootId,
    visitedInteractionIds: [fixture.rootId, fixture.childId],
    currentDateTime: '2026-07-27T09:30',
    statValues: { [fixture.statId]: 5 },
    ownedItemIds: [fixture.itemId],
  });
}

async function saveAndExpectReaderProgress(fixture: ReaderProgressFixture): Promise<ApiJsonObject> {
  const { storyId, rootId, childId, itemId } = fixture;
  const invalid = await patchApi(
    `/api/stories/${storyId}/progress`,
    {
      journeyInteractionIds: [rootId, childId, rootId],
      ownedItemIds: [itemId],
      currentDateTime: '2099-01-01T00:00',
      statValues: { forged: 999 },
    },
    400,
  );
  expect(responseValueAt(parseResponse(invalid), 'message')).toEqual(
    expect.arrayContaining([
      'property currentDateTime should not exist',
      'property statValues should not exist',
    ]),
  );
  const progress = await patchApi(`/api/stories/${storyId}/progress`, {
    journeyInteractionIds: [rootId, childId, rootId],
    ownedItemIds: [itemId],
  });
  const parsed = parseResponse(progress);
  expectReaderProgressState(parsed, fixture);
  return parsed;
}

async function expectProgressSaveSlots(storyId: string, manualSaveId: string): Promise<void> {
  const saves = await getApi(`/api/stories/${storyId}/progress/saves`, 200);
  expect(parseResponseArray(saves)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: 'reader-autosave' }),
      expect.objectContaining({ kind: 'simulation-autosave' }),
      expect.objectContaining({ id: manualSaveId, kind: 'manual', name: 'Before the gate' }),
    ]),
  );
}

it('saves, resumes, reconciles, and resets reader progress', async () => {
  const fixture = await createReaderProgressFixture();
  const progress = await saveAndExpectReaderProgress(fixture);
  await expect(
    request(httpServer).get(`/api/stories/${fixture.storyId}/progress`).expect(200),
  ).resolves.toMatchObject({
    body: { progress: { state: responseObjectAt(progress, 'state') } },
  });
  await deleteApi(`/api/stories/${fixture.storyId}/progress`, 204);
  await request(httpServer)
    .get(`/api/stories/${fixture.storyId}/progress`)
    .expect(200)
    .expect({ progress: null });
});
it('keeps reader and simulation autosaves beside shared named saves', async () => {
  const story = await createStory('Save slots story');
  const withRoot = await createInteraction(story.id);
  const root = withRoot.interactions[0];
  const snapshot = { journeyInteractionIds: [root.id], ownedItemIds: [] };
  await patchApi(`/api/stories/${story.id}/progress`, snapshot, 200);
  await patchApi(`/api/stories/${story.id}/progress/simulation`, snapshot, 200);
  const manual = await postApi(
    `/api/stories/${story.id}/progress/saves`,
    { ...snapshot, name: 'Before the gate' },
    201,
  );
  expect(parseResponse(manual)).toMatchObject({ kind: 'manual', name: 'Before the gate' });
  await expectProgressSaveSlots(story.id, responseStringAt(parseResponse(manual), 'id'));
  await request(httpServer)
    .get(`/api/stories/${story.id}/progress/saves/${responseStringAt(parseResponse(manual), 'id')}`)
    .expect(200)
    .expect((response) => {
      expect(responseValueAt(parseResponse(response), 'state', 'journeyInteractionIds')).toEqual([
        root.id,
      ]);
    });
  await request(httpServer)
    .patch(
      `/api/stories/${story.id}/progress/saves/${responseStringAt(parseResponse(manual), 'id')}`,
    )
    .send({ journeyInteractionIds: [], name: 'After debugging' })
    .expect(200)
    .expect((response) => {
      expect(parseResponse(response)).toMatchObject({ name: 'After debugging' });
      expect(responseValueAt(parseResponse(response), 'state', 'journeyInteractionIds')).toEqual(
        [],
      );
    });
  await deleteApi(
    `/api/stories/${story.id}/progress/saves/${responseStringAt(parseResponse(manual), 'id')}`,
    204,
  );
  await getApi(
    `/api/stories/${story.id}/progress/saves/${responseStringAt(parseResponse(manual), 'id')}`,
    404,
  );
});
it('POST /api/stories/:storyId/interactions creates a root interaction', async () => {
  const story = await createStory();
  const response = await postApi(
    `/api/stories/${story.id}/interactions`,
    { position: { x: 10, y: 20 } },
    201,
  );
  const result = parseResponse(response);
  expect(result.interaction).toMatchObject({
    title: '',
    position: { x: 10, y: 20 },
  });
  expect(
    required(
      required(result.interaction, 'Expected this response value to be present.').triggers,
      'Expected this response value to be present.',
    )[0].inputInteractionIds,
  ).toEqual([]);
  expect(result.revision).toBe(2);
});

type GraphDecorationFixture = { frame: ApiJsonObject; text: ApiJsonObject };

async function createAndUpdateGraphDecorations(storyId: string): Promise<GraphDecorationFixture> {
  const createdFrame = await postApi(
    `/api/stories/${storyId}/graph-decorations`,
    { kind: 'frame', position: { x: 40, y: 60 }, color: '#123abc' },
    201,
  );
  const frame = responseObjectAt(parseResponse(createdFrame), 'decoration');
  expect(frame).toMatchObject({
    kind: 'frame',
    position: { x: 40, y: 60 },
    color: '#123abc',
    width: 420,
    height: 240,
  });
  const updated = await patchApi(
    `/api/stories/${storyId}/graph-decorations/${requiredString(frame.id, 'The frame id is missing.')}`,
    { position: { x: 80, y: 90 }, width: 560, height: 300 },
  );
  expect(responseObjectAt(parseResponse(updated), 'decoration')).toMatchObject({
    kind: 'frame',
    position: { x: 80, y: 90 },
    width: 560,
    height: 300,
  });
  const createdText = await postApi(`/api/stories/${storyId}/graph-decorations`, {
    kind: 'text',
    position: { x: 120, y: 140 },
    text: 'Act one',
    color: '#654321',
    fontSize: 48,
    fontFamily: 'serif',
    fontWeight: 'bold',
    fontStyle: 'italic',
  });
  const text = responseObjectAt(parseResponse(createdText), 'decoration');
  expect(text).toMatchObject({
    kind: 'text',
    text: 'Act one',
    fontSize: 48,
    fontFamily: 'serif',
    fontWeight: 'bold',
    fontStyle: 'italic',
  });
  return { frame, text };
}

it('creates, updates, persists, and deletes visual graph decorations', async () => {
  const story = await createStory();
  const interactionGraph = await createInteraction(story.id, { position: { x: 10, y: 20 } });
  const { frame, text } = await createAndUpdateGraphDecorations(story.id);
  const loaded = await getApi(`/api/stories/${story.id}`, 200);
  expect(responseObjectArrayAt(parseResponse(loaded), 'graphDecorations')).toHaveLength(2);
  expect(responseObjectArrayAt(parseResponse(loaded), 'interactions')).toEqual(
    interactionGraph.interactions,
  );
  const deletion = await deleteApi(
    `/api/stories/${story.id}/graph-decorations/${requiredString(frame.id, 'The frame id is missing.')}`,
    200,
  );
  expect(typeof responseNumberAt(parseResponse(deletion), 'revision')).toBe('number');
  expect(typeof responseStringAt(parseResponse(deletion), 'updatedAt')).toBe('string');
  expect(parseResponse(deletion)).toMatchObject({
    decorationId: requiredString(frame.id, 'The frame id is missing.'),
  });
  expect(parseResponse(deletion)).not.toHaveProperty('interactions');
  const afterDelete = await getApi(`/api/stories/${story.id}`, 200);
  expect(responseObjectArrayAt(parseResponse(afterDelete), 'graphDecorations')).toEqual([text]);
});
it('rejects invalid graph decoration presentation values', async () => {
  const story = await createStory();
  await postApi(
    `/api/stories/${story.id}/graph-decorations`,
    { kind: 'frame', position: { x: 0, y: 0 }, color: 'blue', width: 40 },
    400,
  );
  await postApi(
    `/api/stories/${story.id}/graph-decorations`,
    { kind: 'text', position: { x: 0, y: 0 }, fontSize: 120 },
    400,
  );
});
it('POST /api/stories/:storyId/interactions creates a child interaction linked to its parent', async () => {
  const story = await createStory();
  const withRoot = await createInteraction(story.id);
  const parent = withRoot.interactions[0];
  const response = await postApi(
    `/api/stories/${story.id}/interactions`,
    { parentId: parent.id, position: { x: 100, y: 120 } },
    201,
  );
  const result = parseResponse(response);
  expect(
    required(
      required(result.interaction, 'Expected this response value to be present.').triggers,
      'Expected this response value to be present.',
    )[0].inputInteractionIds,
  ).toEqual([parent.id]);
});
it('PATCH /api/stories/:storyId/interactions/:interactionId updates an interaction', async () => {
  const story = await createStory();
  const withInteraction = await createInteraction(story.id);
  const interaction = withInteraction.interactions[0];
  const response = await patchApi(
    `/api/stories/${story.id}/interactions/${interaction.id}`,
    {
      title: 'Renamed interaction',
      body: 'New content',
      position: { x: 42, y: 84 },
      durationMinutes: 45,
    },
    200,
  );
  expect(responseObjectAt(parseResponse(response), 'interaction')).toMatchObject({
    id: interaction.id,
    title: 'Renamed interaction',
    body: 'New content',
    position: { x: 42, y: 84 },
    durationMinutes: 45,
  });
  await patchApi(
    `/api/stories/${story.id}/interactions/${interaction.id}`,
    { durationMinutes: -1 },
    400,
  );
  const clearedTitle = await patchApi(
    `/api/stories/${story.id}/interactions/${interaction.id}`,
    { title: '' },
    200,
  );
  expect(parseResponse(clearedTitle)).toMatchObject({ interaction: { title: '' } });
});
it('keeps persisted title and content when PATCH updates only an interaction position', async () => {
  const story = await createStory();
  const withInteraction = await createInteraction(story.id);
  const interaction = withInteraction.interactions[0];
  await patchApi(
    `/api/stories/${story.id}/interactions/${interaction.id}`,
    { position: { x: 240, y: 360 } },
    200,
  );
  const response = await getApi(`/api/stories/${story.id}`, 200);
  expect(responseObjectAt(parseResponse(response), 'interactions', 0)).toMatchObject({
    id: interaction.id,
    title: interaction.title,
    body: interaction.body,
    position: { x: 240, y: 360 },
  });
});
it('serializes concurrent partial updates without losing either field', async () => {
  const story = await createStory();
  const withInteraction = await createInteraction(story.id);
  const interaction = withInteraction.interactions[0];
  const path = `/api/stories/${story.id}/interactions/${interaction.id}`;
  await Promise.all([
    request(httpServer).patch(path).send({ title: 'Concurrent title' }).expect(200),
    request(httpServer).patch(path).send({ body: 'Concurrent content' }).expect(200),
  ]);
  const response = await getApi(`/api/stories/${story.id}`, 200);
  expect(responseObjectAt(parseResponse(response), 'interactions', 0)).toMatchObject({
    title: 'Concurrent title',
    body: 'Concurrent content',
  });
});
it('rejects null interaction titles and positions but normalizes a null body', async () => {
  const story = await createStory();
  const withInteraction = await createInteraction(story.id);
  const interaction = withInteraction.interactions[0];
  const path = `/api/stories/${story.id}/interactions/${interaction.id}`;
  await patchApi(path, { title: null }, 400);
  await patchApi(path, { position: null }, 400);
  const response = await patchApi(path, { body: null }, 200);
  expect(responseObjectAt(parseResponse(response), 'interaction')).toMatchObject({
    title: interaction.title,
    body: '',
    position: interaction.position,
  });
});
it('rejects interaction bodies above the authored content limit', async () => {
  const story = await createStory();
  const withInteraction = await createInteraction(story.id);
  const interaction = withInteraction.interactions[0];
  await patchApi(
    `/api/stories/${story.id}/interactions/${interaction.id}`,
    { body: 'x'.repeat(MAX_INTERACTION_BODY_LENGTH + 1) },
    400,
  );
});
it('rejects an over-quota edit atomically with a stable 422 response, while allowing deletion', async () => {
  const story = await createStory();
  const first = await createInteraction(story.id);
  const second = await createInteraction(story.id);
  const previous = process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS;
  process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS = '1';
  try {
    const rejected = await postApi(`/api/stories/${story.id}/interactions`, {}, 422);
    expect(parseResponse(rejected)).toMatchObject({
      code: 'STORY_QUOTA_EXCEEDED',
      details: { resource: 'interactions', limit: 1, current: 2, attempted: 3 },
    });
    const unchanged = await getApi(`/api/stories/${story.id}`, 200);
    expect(responseObjectArrayAt(parseResponse(unchanged), 'interactions')).toHaveLength(2);
    expect(responseNumberAt(parseResponse(unchanged), 'revision')).toBe(second.revision);
    await deleteApi(`/api/stories/${story.id}/interactions/${first.interactions[0].id}`, 200);
    const reduced = await getApi(`/api/stories/${story.id}`, 200);
    expect(responseObjectArrayAt(parseResponse(reduced), 'interactions')).toHaveLength(1);
    const undo = await request(httpServer)
      .post(`/api/stories/${story.id}/history/undo`)
      .expect(422);
    expect(parseResponse(undo)).toMatchObject({
      code: 'STORY_QUOTA_EXCEEDED',
      details: { resource: 'interactions', limit: 1, current: 1, attempted: 2 },
    });
    const afterUndo = await getApi(`/api/stories/${story.id}`, 200);
    expect(parseResponse(afterUndo)).toMatchObject({
      revision: responseNumberAt(parseResponse(reduced), 'revision'),
    });
    expect(responseObjectArrayAt(parseResponse(afterUndo), 'interactions')).toHaveLength(1);
  } finally {
    if (previous === undefined) {
      delete process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS;
    } else {
      process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS = previous;
    }
  }
});
it('rejects an over-quota ChoiceScript import without creating a Story', async () => {
  const previous = process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS;
  process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS = '1';
  try {
    const rejected = await postApi(
      '/api/stories/imports/choicescript',
      {
        files: [
          {
            name: 'startup.txt',
            content:
              '*title Quota import\nOpening.\n*choice\n  #Continue\n    Ending.\n    *ending',
          },
        ],
      },
      422,
    );
    expect(parseResponse(rejected)).toMatchObject({
      code: 'STORY_QUOTA_EXCEEDED',
      details: { resource: 'interactions', limit: 1, current: 0 },
    });
    expect(responseNumberAt(parseResponse(rejected), 'details', 'attempted')).toBeGreaterThan(1);
    const stories = await getApi('/api/stories', 200);
    expect(responseNumberAt(parseResponse(stories), 'totalCount')).toBe(0);
  } finally {
    if (previous === undefined) {
      delete process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS;
    } else {
      process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS = previous;
    }
  }
});
it('rejects redo when it would restore an over-quota entity', async () => {
  const story = await createStory();
  await createInteraction(story.id);
  await createInteraction(story.id);
  await request(httpServer).post(`/api/stories/${story.id}/history/undo`).expect(201);
  const previous = process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS;
  process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS = '1';
  try {
    const before = await getApi(`/api/stories/${story.id}`, 200);
    const rejected = await request(httpServer)
      .post(`/api/stories/${story.id}/history/redo`)
      .expect(422);
    expect(parseResponse(rejected)).toMatchObject({
      code: 'STORY_QUOTA_EXCEEDED',
      details: { resource: 'interactions', limit: 1, current: 1, attempted: 2 },
    });
    const after = await getApi(`/api/stories/${story.id}`, 200);
    expect(parseResponse(after)).toMatchObject({
      revision: responseNumberAt(parseResponse(before), 'revision'),
    });
    expect(responseObjectArrayAt(parseResponse(after), 'interactions')).toHaveLength(1);
  } finally {
    if (previous === undefined) {
      delete process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS;
    } else {
      process.env.PARALLEAX_STORY_QUOTA_INTERACTIONS = previous;
    }
  }
});
it('rejects raw request bodies above the global HTTP limit', async () => {
  const response = await postApi('/api/stories', { title: 'x'.repeat(140000) }, 413);
  expect(parseResponse(response)).toMatchObject({
    status: 413,
    code: 'PAYLOAD_TOO_LARGE',
    message: 'Request body is too large.',
  });
});
it('sanitizes rich interaction content while preserving supported media', async () => {
  const story = await createStory();
  const withInteraction = await createInteraction(story.id);
  const interaction = withInteraction.interactions[0];
  const body =
    '<h2>Arrival</h2><p><strong>Hello</strong></p>' +
    '<img src="https://media.example/scene.gif" onerror="alert(1)">' +
    '<video src="https://media.example/scene.mp4"></video>' +
    '<div data-conditional-text-target="next" onclick="alert(1)">' +
    '<button type="button" contenteditable="false" data-conditional-text-link="next">Next</button>' +
    '<p>Conditional clue</p></div>' +
    `<span data-interaction-link-target="${interaction.id}">Continue</span>` +
    '<span data-stat-value="score" data-stat-item="item-1" onclick="alert(1)"></span>' +
    '<iframe src="https://www.youtube-nocookie.com/embed/video-1"></iframe>' +
    '<iframe src="https://evil.example/embed"></iframe><script>alert(1)</script>';
  const response = await patchApi(
    `/api/stories/${story.id}/interactions/${interaction.id}`,
    { body },
    200,
  );
  const sanitized = responseValueAt(parseResponse(response), 'interaction', 'body');
  expect(sanitized).toContain('<h2>Arrival</h2>');
  expect(sanitized).toContain('https://media.example/scene.gif');
  expect(sanitized).toContain('https://media.example/scene.mp4');
  expect(sanitized).toContain('data-conditional-text-target="next"');
  expect(sanitized).toContain('data-conditional-text-link="next"');
  expect(sanitized).toContain(`data-interaction-link-target="${interaction.id}"`);
  expect(sanitized).toContain('data-stat-value="score"');
  expect(sanitized).toContain('data-stat-item="item-1"');
  expect(sanitized).not.toContain('onclick');
  expect(sanitized).toContain('https://www.youtube-nocookie.com/embed/video-1');
  expect(sanitized).not.toContain('onerror');
  expect(sanitized).not.toContain('evil.example');
  expect(sanitized).not.toContain('<script');
});
it('rejects unknown interaction patch fields', async () => {
  const story = await createStory();
  const withInteraction = await createInteraction(story.id);
  const interaction = withInteraction.interactions[0];
  await patchApi(
    `/api/stories/${story.id}/interactions/${interaction.id}`,
    { unexpected: true },
    400,
  );
});
it('DELETE /api/stories/:storyId/interactions/:interactionId deletes an interaction and turns orphaned triggers into root triggers', async () => {
  const story = await createStory();
  const withParent = await createInteraction(story.id);
  const parent = withParent.interactions[0];
  const withChild = await createInteraction(story.id, { parentId: parent.id });
  const child = required(
    withChild.interactions.find((item) => item.id !== parent.id),
    'The child interaction was not returned.',
  );
  const response = await deleteApi(`/api/stories/${story.id}/interactions/${parent.id}`, 200);
  expect(typeof responseNumberAt(parseResponse(response), 'revision')).toBe('number');
  expect(typeof responseStringAt(parseResponse(response), 'updatedAt')).toBe('string');
  expect(parseResponse(response)).toMatchObject({
    interactionId: parent.id,
  });
  expect(parseResponse(response)).not.toHaveProperty('interactions');
  const afterDelete = await getApi(`/api/stories/${story.id}`, 200);
  expect(responseObjectArrayAt(parseResponse(afterDelete), 'interactions')).toHaveLength(1);
  expect(responseStringAt(parseResponse(afterDelete), 'interactions', 0, 'id')).toBe(child.id);
  expect(
    responseObjectAt(parseResponse(afterDelete), 'interactions', 0, 'triggers', 0),
  ).toMatchObject({
    inputInteractionIds: [],
    conditionGroups: [{ conditions: [] }],
  });
});
it('DELETE /api/stories/:storyId/interactions/:interactionId keeps triggers that still have other inputs', async () => {
  const story = await createStory();
  const withFirstParent = await createInteraction(story.id);
  const firstParent = withFirstParent.interactions[0];
  const withSecondParent = await createInteraction(story.id);
  const secondParent = required(
    withSecondParent.interactions.find((item) => item.id !== firstParent.id),
    'The second parent interaction was not returned.',
  );
  const withChild = await createInteraction(story.id, { parentId: firstParent.id });
  const child = required(
    withChild.interactions.find(
      (item) => item.id !== firstParent.id && item.id !== secondParent.id,
    ),
    'The child interaction was not returned.',
  );
  const trigger = child.triggers[0];
  await patchApi(
    `/api/stories/${story.id}/interactions/${child.id}/triggers/${trigger.id}`,
    {
      inputInteractionIds: [firstParent.id, secondParent.id],
      conditions: [{ interactionId: firstParent.id, hasBeenVisited: true }],
    },
    200,
  );
  const response = await deleteApi(`/api/stories/${story.id}/interactions/${firstParent.id}`, 200);
  expect(parseResponse(response)).toMatchObject({
    interactionId: firstParent.id,
  });
  const afterDelete = await getApi(`/api/stories/${story.id}`, 200);
  const updatedChild = required(
    responseObjectArrayAt(parseResponse(afterDelete), 'interactions').find(
      (item) => item.id === child.id,
    ),
    'The child interaction was not found after deletion.',
  );
  expect(updatedChild.triggers).toHaveLength(1);
  expect(
    required(updatedChild.triggers, 'Expected this response value to be present.')[0]
      .inputInteractionIds,
  ).toEqual([secondParent.id]);
  expect(
    required(updatedChild.triggers, 'Expected this response value to be present.')[0]
      .conditionGroups,
  ).toEqual([expect.objectContaining({ conditions: [] })]);
});
it('POST /api/stories/:storyId/interactions/:interactionId/triggers adds a trigger', async () => {
  const story = await createStory();
  const withInteraction = await createInteraction(story.id);
  const interaction = withInteraction.interactions[0];
  const response = await request(httpServer)
    .post(`/api/stories/${story.id}/interactions/${interaction.id}/triggers`)
    .expect(201);
  const result = parseResponse(response);
  expect(result.interactionId).toBe(interaction.id);
  expect(result.trigger).toMatchObject({
    inputInteractionIds: [],
    conditionGroups: [{ conditions: [] }],
    appearanceProbability: 100,
  });
});
it('PATCH /api/stories/:storyId/interactions/:interactionId/triggers/:triggerId updates a trigger', async () => {
  const story = await createStory();
  const withParent = await createInteraction(story.id);
  const parent = withParent.interactions[0];
  const withChild = await createInteraction(story.id, { parentId: parent.id });
  const child = required(
    withChild.interactions.find((item) => item.id !== parent.id),
    'The child interaction was not returned.',
  );
  const trigger = child.triggers[0];
  const response = await patchApi(
    `/api/stories/${story.id}/interactions/${child.id}/triggers/${trigger.id}`,
    {
      inputInteractionIds: [parent.id, parent.id],
      conditions: [{ interactionId: parent.id, hasBeenVisited: true }],
      timerSeconds: 0,
    },
    200,
  );
  const result = parseResponse(response);
  expect(result.interactionId).toBe(child.id);
  expect(
    required(result.trigger, 'Expected this response value to be present.').inputInteractionIds,
  ).toEqual([parent.id]);
  expect(
    required(
      required(result.trigger, 'Expected this response value to be present.').conditionGroups,
      'Expected this response value to be present.',
    )[0].conditions,
  ).toEqual([{ interactionId: parent.id, hasBeenVisited: true }]);
  expect(required(result.trigger, 'Expected this response value to be present.').timerSeconds).toBe(
    0,
  );
  await patchApi(
    `/api/stories/${story.id}/interactions/${child.id}/triggers/${trigger.id}`,
    { timerSeconds: -1 },
    400,
  );
  const cleared = await patchApi(
    `/api/stories/${story.id}/interactions/${child.id}/triggers/${trigger.id}`,
    { timerSeconds: null },
    200,
  );
  expect(responseValueAt(parseResponse(cleared), 'trigger', 'timerSeconds')).toBeNull();
});
it('updates only a trigger canvas position without changing its narrative rules', async () => {
  const story = await createStory();
  const withParent = await createInteraction(story.id);
  const parent = withParent.interactions[0];
  const withChild = await createInteraction(story.id, { parentId: parent.id });
  const child = required(
    withChild.interactions.find((item) => item.id !== parent.id),
    'The child interaction was not returned.',
  );
  const trigger = child.triggers[0];
  const response = await patchApi(
    `/api/stories/${story.id}/interactions/${child.id}/triggers/${trigger.id}`,
    { position: { x: 245, y: 180 } },
    200,
  );
  const result = parseResponse(response);
  expect(result.trigger).toEqual({
    ...trigger,
    position: { x: 245, y: 180 },
  });
});
it('rejects an invalid trigger canvas position', async () => {
  const story = await createStory();
  const graph = await createInteraction(story.id);
  const interaction = graph.interactions[0];
  await patchApi(
    `/api/stories/${story.id}/interactions/${interaction.id}/triggers/${interaction.triggers[0].id}`,
    { position: { x: null, y: 180 } },
    400,
  );
});
it('stores several temporal dates, weekdays, and time slots on a trigger', async () => {
  const story = await createStory();
  const graph = await createInteraction(story.id);
  const interaction = graph.interactions[0];
  const trigger = interaction.triggers[0];
  const temporal = {
    dates: ['2026-08-15'],
    dateRanges: [{ startDate: '2026-09-01', endDate: '2026-09-03' }],
    weekdays: ['monday', 'tuesday'],
    timeSlots: [
      { startTime: '09:00', endTime: '12:00' },
      { startTime: '22:00', endTime: '02:00' },
    ],
  };
  const response = await patchApi(
    `/api/stories/${story.id}/interactions/${interaction.id}/triggers/${trigger.id}`,
    { inputInteractionIds: [], conditions: [{ temporal }] },
    200,
  );
  expect(
    responseObjectArrayAt(parseResponse(response), 'trigger', 'conditionGroups', 0, 'conditions'),
  ).toEqual([{ temporal }]);
  await patchApi(
    `/api/stories/${story.id}/interactions/${interaction.id}/triggers/${trigger.id}`,
    {
      inputInteractionIds: [],
      conditions: [{ temporal: { timeSlots: [{ startTime: '09:00', endTime: '09:00' }] } }],
    },
    400,
  );
});
it('rejects trigger references to interactions from another story', async () => {
  const first = await createStory('First story');
  const firstGraph = await createInteraction(first.id);
  const target = firstGraph.interactions[0];
  const second = await createStory('Second story');
  const secondGraph = await createInteraction(second.id);
  const foreign = secondGraph.interactions[0];
  await patchApi(
    `/api/stories/${first.id}/interactions/${target.id}/triggers/${target.triggers[0].id}`,
    {
      inputInteractionIds: [foreign.id],
      conditions: [{ interactionId: foreign.id, hasBeenVisited: true }],
    },
    400,
  );
});
it('creates and updates locations, then assigns one to an interaction', async () => {
  const story = await createStory();
  const withInteraction = await createInteraction(story.id);
  const interaction = withInteraction.interactions[0];
  const created = await postApi(
    `/api/stories/${story.id}/locations`,
    { name: 'Harbor', description: 'A quiet harbor.' },
    201,
  );
  const location = responseObjectAt(parseResponse(created), 'location');
  const updated = await patchApi(
    `/api/stories/${story.id}/locations/${required(location, 'Expected this response value to be present.').id}`,
    { name: 'Old harbor' },
    200,
  );
  expect(responseObjectAt(parseResponse(updated), 'location')).toMatchObject({
    id: required(location, 'Expected this response value to be present.').id,
    name: 'Old harbor',
    description: 'A quiet harbor.',
  });
  const assigned = await patchApi(
    `/api/stories/${story.id}/interactions/${interaction.id}`,
    { locationId: required(location, 'Expected this response value to be present.').id },
    200,
  );
  expect(responseStringAt(parseResponse(assigned), 'interaction', 'locationId')).toBe(
    required(location, 'Expected this response value to be present.').id,
  );
});
const optionalResourceFixtures = [
  {
    path: 'locations',
    create: { name: 'Harbor', category: 'Places', imageUrl: 'https://images.example/harbor.png' },
    resultKey: 'location',
  },
  {
    path: 'characters',
    create: { name: 'Mira', category: 'Allies', imageUrl: 'https://images.example/mira.png' },
    resultKey: 'character',
  },
  {
    path: 'stat-definitions',
    create: {
      name: 'Trust',
      category: 'Relationships',
      imageUrl: 'https://images.example/trust.svg',
    },
    resultKey: 'statDefinition',
  },
  {
    path: 'item-definitions',
    create: { name: 'Key', category: 'Quest items', imageUrl: 'https://images.example/key.png' },
    resultKey: 'itemDefinition',
  },
] as const;

async function updateOptionalResourceMetadata(storyId: string): Promise<void> {
  for (const resource of optionalResourceFixtures) {
    const created = await postApi(`/api/stories/${storyId}/${resource.path}`, resource.create);
    const entity = requiredJsonObject(
      parseResponse(created)[resource.resultKey],
      `The ${resource.path} response did not contain an entity.`,
    );
    expect(entity.imageUrl).toBe(resource.create.imageUrl);
    expect(entity.category).toBe(resource.create.category);
    const imageUrl = `${resource.create.imageUrl}?version=2`;
    const category = `${resource.create.category} updated`;
    const updated = await patchApi(
      `/api/stories/${storyId}/${resource.path}/${requiredString(entity.id, 'The entity id is missing.')}`,
      { category, imageUrl },
    );
    const updatedEntity = requiredJsonObject(
      parseResponse(updated)[resource.resultKey],
      `The updated ${resource.path} response did not contain an entity.`,
    );
    expect(updatedEntity.imageUrl).toBe(imageUrl);
    expect(updatedEntity.category).toBe(category);
  }
  await postApi(
    `/api/stories/${storyId}/locations`,
    {
      name: 'Invalid category',
      category: 'x'.repeat(101),
    },
    400,
  );
}

it('stores optional images and categories for locations, characters, stats, and items', async () => {
  const story = await createStory();
  await updateOptionalResourceMetadata(story.id);
});
it('validates location references in interactions and trigger conditions', async () => {
  const first = await createStory('First story');
  const firstGraph = await createInteraction(first.id);
  const target = firstGraph.interactions[0];
  const second = await createStory('Second story');
  const foreignLocationResponse = await postApi(
    `/api/stories/${second.id}/locations`,
    { name: 'Foreign place' },
    201,
  );
  const foreignLocation = responseObjectAt(parseResponse(foreignLocationResponse), 'location');
  await patchApi(
    `/api/stories/${first.id}/interactions/${target.id}`,
    {
      locationId: required(foreignLocation, 'Expected this response value to be present.').id,
    },
    400,
  );
  await patchApi(
    `/api/stories/${first.id}/interactions/${target.id}/triggers/${target.triggers[0].id}`,
    {
      conditions: [
        {
          locationId: required(foreignLocation, 'Expected this response value to be present.').id,
          isCurrentLocation: true,
        },
      ],
    },
    400,
  );
  await patchApi(
    `/api/stories/${first.id}/interactions/${target.id}/triggers/${target.triggers[0].id}`,
    {
      conditions: [
        {
          interactionId: target.id,
          hasBeenVisited: true,
          locationId: required(foreignLocation, 'Expected this response value to be present.').id,
          isCurrentLocation: true,
        },
      ],
    },
    400,
  );
});
async function expectPlayableCharacterSelection(
  storyId: string,
  characterId: string,
): Promise<void> {
  const second = await postApi(`/api/stories/${storyId}/characters`, {
    name: 'Luc',
    isPlayable: true,
  });
  expect(responseValueAt(parseResponse(second), 'character', 'isPlayable')).toBe(true);
  const selected = await patchApi(`/api/stories/${storyId}/characters/${characterId}`, {
    isPlayable: true,
  });
  expect(responseValueAt(parseResponse(selected), 'character', 'isPlayable')).toBe(true);
  const reloaded = await getApi(`/api/stories/${storyId}`);
  expect(
    responseObjectArrayAt(parseResponse(reloaded), 'characters').filter(
      ({ isPlayable }: { isPlayable?: boolean }) => isPlayable,
    ),
  ).toEqual([expect.objectContaining({ id: characterId })]);
}

async function assignCharacterToInteraction(
  storyId: string,
  interactionId: string,
  characterId: string,
): Promise<void> {
  const assigned = await patchApi(`/api/stories/${storyId}/interactions/${interactionId}`, {
    characterIds: [characterId, characterId],
  });
  expect(responseStringArrayAt(parseResponse(assigned), 'interaction', 'characterIds')).toEqual([
    characterId,
  ]);
}

it('creates and updates characters, then assigns several to an interaction', async () => {
  const story = await createStory();
  const interaction = (await createInteraction(story.id)).interactions[0];
  const created = await postApi(`/api/stories/${story.id}/characters`, {
    name: 'Mira',
    description: 'An investigator.',
  });
  const character = responseObjectAt(parseResponse(created), 'character');
  const characterId = requiredString(character.id, 'The character id is missing.');
  const updated = await patchApi(`/api/stories/${story.id}/characters/${characterId}`, {
    name: 'Mira Vale',
  });
  expect(responseObjectAt(parseResponse(updated), 'character')).toMatchObject({
    id: characterId,
    name: 'Mira Vale',
    description: 'An investigator.',
  });
  await expectPlayableCharacterSelection(story.id, characterId);
  await assignCharacterToInteraction(story.id, interaction.id, characterId);
});
async function expectStoredTriggerCondition(
  storyId: string,
  interactionIndex: number,
  condition: ApiJsonObject,
): Promise<void> {
  const reloaded = await getApi(`/api/stories/${storyId}`);
  expect(
    triggerConditions(
      responseObjectAt(parseResponse(reloaded), 'interactions', interactionIndex, 'triggers', 0),
    ),
  ).toEqual([condition]);
}

it('validates expressions over HTTP and reconstructs their results from the journey', async () => {
  const story = await createStory();
  const root = (await createInteraction(story.id)).interactions[0];
  const definition = await postApi(
    `/api/stories/${story.id}/stat-definitions`,
    { name: 'Score', valueType: 'number' },
    201,
  );
  const assigned = await postApi(
    `/api/stories/${story.id}/stats`,
    {
      statDefinitionId: responseStringAt(parseResponse(definition), 'statDefinition', 'id'),
      ownerType: 'story',
      initialValue: 2,
    },
    201,
  );
  const stat = responseObjectAt(parseResponse(assigned), 'stats', 0);
  const statId = requiredString(stat.id, 'The stat assignment id is missing.');
  const effect = { statId, operation: 'set', expression: `(@{${statId}} + 3) * 2` };
  const interactionUrl = `/api/stories/${story.id}/interactions/${root.id}`;
  await patchApi(interactionUrl, { statEffects: [effect] }, 200);
  for (const invalid of [
    { ...effect, expression: true },
    { ...effect, expression: '@{other-story}' },
    { ...effect, expression: 'true' },
    { ...effect, expression: '' },
    { ...effect, value: 2 },
  ]) {
    await patchApi(interactionUrl, { statEffects: [invalid] }, 400);
  }
  const loaded = await getApi(`/api/stories/${story.id}`, 200);
  expect(responseObjectArrayAt(parseResponse(loaded), 'interactions', 0, 'statEffects')).toEqual([
    effect,
  ]);
  const progress = await patchApi(
    `/api/stories/${story.id}/progress`,
    { journeyInteractionIds: [root.id] },
    200,
  );
  expect(responseValueAt(parseResponse(progress), 'state', 'statValues')).toEqual({ [statId]: 10 });
  const condition = { statId, operator: 'gte', expression: `@{${statId}} - 1` };
  await patchApi(
    `${interactionUrl}/triggers/${root.triggers[0].id}`,
    { conditions: [condition] },
    200,
  );
  await expectStoredTriggerCondition(story.id, 0, condition);
});
type TypedStatFixture = {
  storyId: string;
  rootId: string;
  childId: string;
  childTriggerId: string;
  definitionId: string;
  assignmentId: string;
};

async function createTypedStatFixture(): Promise<TypedStatFixture> {
  const story = await createStory();
  const root = (await createInteraction(story.id)).interactions[0];
  const withChild = await createInteraction(story.id, { parentId: root.id });
  const child = required(
    withChild.interactions.find(({ id }) => id !== root.id),
    'The child interaction was not returned.',
  );
  const withDefinition = await postApi(
    `/api/stories/${story.id}/stat-definitions`,
    { name: 'Score', valueType: 'number' },
    201,
  );
  const definition = responseObjectAt(parseResponse(withDefinition), 'statDefinition');
  expect(definition).not.toHaveProperty('key');
  const definitionId = requiredString(definition.id, 'The stat definition id is missing.');
  const withAssignment = await postApi(
    `/api/stories/${story.id}/stats`,
    {
      statDefinitionId: definitionId,
      ownerType: 'story',
      initialValue: 2,
    },
    201,
  );
  const assignment = responseObjectAt(parseResponse(withAssignment), 'stats', 0);
  return {
    storyId: story.id,
    rootId: root.id,
    childId: child.id,
    childTriggerId: child.triggers[0].id,
    definitionId,
    assignmentId: requiredString(assignment.id, 'The stat assignment id is missing.'),
  };
}

async function attachTypedStatEffectAndCondition(fixture: TypedStatFixture): Promise<void> {
  await patchApi(`/api/stories/${fixture.storyId}/interactions/${fixture.rootId}`, {
    statEffects: [{ statId: fixture.assignmentId, operation: 'add', value: 3 }],
  });
  await patchApi(
    `/api/stories/${fixture.storyId}/interactions/${fixture.childId}/triggers/${fixture.childTriggerId}`,
    { conditions: [{ statId: fixture.assignmentId, operator: 'gte', value: 5 }] },
  );
}

async function rejectAndDeleteTypedStat(fixture: TypedStatFixture): Promise<void> {
  await postApi(
    `/api/stories/${fixture.storyId}/stats`,
    { statDefinitionId: fixture.definitionId, ownerType: 'story', initialValue: 9 },
    400,
  );
  await patchApi(
    `/api/stories/${fixture.storyId}/interactions/${fixture.rootId}`,
    { statEffects: [{ statId: fixture.assignmentId, operation: 'set', value: false }] },
    400,
  );
  const deleted = await deleteApi(`/api/stories/${fixture.storyId}/stats/${fixture.assignmentId}`);
  expect(responseObjectArrayAt(parseResponse(deleted), 'interactions')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: fixture.rootId, statEffects: [] }),
      expect.objectContaining({
        id: fixture.childId,
        triggers: [
          expect.objectContaining({
            conditionGroups: [expect.objectContaining({ conditions: [] })],
          }),
        ],
      }),
    ]),
  );
}

it('creates typed stats, attaches them, and replays effects and conditions', async () => {
  const fixture = await createTypedStatFixture();
  await attachTypedStatEffectAndCondition(fixture);
  const progress = await patchApi(`/api/stories/${fixture.storyId}/progress`, {
    journeyInteractionIds: [fixture.rootId],
  });
  const progressState = responseObjectAt(parseResponse(progress), 'state');
  expect(
    typeof required(progressState, 'Expected this response value to be present.').randomSeed,
  ).toBe('string');
  expect(
    required(progressState, 'Expected this response value to be present.').stepStartedAt,
  ).toEqual(expect.arrayContaining([expect.any(String)]));
  expect(progressState).toMatchObject({
    version: 4,
    statValues: {
      [fixture.assignmentId]: 5,
    },
  });
  await rejectAndDeleteTypedStat(fixture);
});
type CharacterStatFixture = {
  storyId: string;
  characterId: string;
  definitionId: string;
  interactionId: string;
  triggerId: string;
};

async function createCharacterStatFixture(): Promise<CharacterStatFixture> {
  const story = await createStory();
  const interaction = (await createInteraction(story.id)).interactions[0];
  const character = await postApi(`/api/stories/${story.id}/characters`, { name: 'Mira' });
  const definition = await postApi(`/api/stories/${story.id}/stat-definitions`, { name: 'Trust' });
  return {
    storyId: story.id,
    characterId: responseStringAt(parseResponse(character), 'character', 'id'),
    definitionId: responseStringAt(parseResponse(definition), 'statDefinition', 'id'),
    interactionId: interaction.id,
    triggerId: interaction.triggers[0].id,
  };
}

async function expectCharacterStatChangeRateValidation(
  fixture: CharacterStatFixture,
): Promise<void> {
  const changedDefinition = await patchApi(
    `/api/stories/${fixture.storyId}/stat-definitions/${fixture.definitionId}`,
    { changePerHour: -1.5 },
  );
  expect(
    responseNumberAt(parseResponse(changedDefinition), 'statDefinition', 'changePerHour'),
  ).toBe(-1.5);
  await patchApi(
    `/api/stories/${fixture.storyId}/stat-definitions/${fixture.definitionId}`,
    { changePerHour: 'fast' },
    400,
  );
}

async function createAndUpdateCharacterStat(fixture: CharacterStatFixture): Promise<string> {
  const created = await postApi(
    `/api/stories/${fixture.storyId}/characters/${fixture.characterId}/stats`,
    { statDefinitionId: fixture.definitionId, initialValue: 2 },
  );
  const stat = responseObjectAt(parseResponse(created), 'stat');
  expect(stat).toMatchObject({ statDefinitionId: fixture.definitionId, initialValue: 2 });
  const statId = responseStringAt(parseResponse(created), 'stat', 'id');
  const updated = await patchApi(
    `/api/stories/${fixture.storyId}/characters/${fixture.characterId}/stats/${statId}`,
    { initialValue: 3 },
  );
  expect(responseValueAt(parseResponse(updated), 'stat', 'initialValue')).toBe(3);
  return statId;
}

async function attachCharacterStatEffects(
  fixture: CharacterStatFixture,
  statId: string,
): Promise<void> {
  const withEffect = await patchApi(
    `/api/stories/${fixture.storyId}/interactions/${fixture.interactionId}`,
    { statEffects: [{ statId, operation: 'add', value: 1 }] },
  );
  expect(responseObjectArrayAt(parseResponse(withEffect), 'interaction', 'statEffects')).toEqual([
    { statId, operation: 'add', value: 1 },
  ]);
  const conditioned = await patchApi(
    `/api/stories/${fixture.storyId}/interactions/${fixture.interactionId}/triggers/${fixture.triggerId}`,
    { inputInteractionIds: [], conditions: [{ statId, operator: 'gte', value: 4 }] },
  );
  expect(
    responseObjectArrayAt(
      parseResponse(conditioned),
      'trigger',
      'conditionGroups',
      0,
      'conditions',
    ),
  ).toEqual([{ statId, operator: 'gte', value: 4 }]);
}

it('creates and updates character stats, then uses them in effects and conditions', async () => {
  const fixture = await createCharacterStatFixture();
  await expectCharacterStatChangeRateValidation(fixture);
  const statId = await createAndUpdateCharacterStat(fixture);
  await attachCharacterStatEffects(fixture, statId);
});
type ReusableItemFixture = { storyId: string; characterId: string; definitionId: string };

async function createReusableItemFixture(storyId: string): Promise<ReusableItemFixture> {
  const character = await postApi(`/api/stories/${storyId}/characters`, { name: 'Mira' });
  const characterId = responseStringAt(parseResponse(character), 'character', 'id');
  const statDefinition = await postApi(`/api/stories/${storyId}/stat-definitions`, {
    name: 'Durability',
  });
  const statDefinitionId = responseStringAt(parseResponse(statDefinition), 'statDefinition', 'id');
  const definitionResponse = await postApi(`/api/stories/${storyId}/item-definitions`, {
    name: 'Key',
    description: 'A brass key.',
    stats: [{ statDefinitionId, initialValue: 10 }],
  });
  const definition = responseObjectAt(parseResponse(definitionResponse), 'itemDefinition');
  expect(definition).toMatchObject({
    name: 'Key',
    description: 'A brass key.',
    stats: [{ statDefinitionId, initialValue: 10 }],
  });
  const updatedDefinition = await patchApi(
    `/api/stories/${storyId}/item-definitions/${requiredString(definition.id, 'The item definition id is missing.')}`,
    { name: 'Archive key' },
  );
  expect(responseStringAt(parseResponse(updatedDefinition), 'itemDefinition', 'name')).toBe(
    'Archive key',
  );
  return {
    storyId,
    characterId,
    definitionId: requiredString(definition.id, 'The item definition id is missing.'),
  };
}

async function createOwnedItemInstances(fixture: ReusableItemFixture): Promise<ApiJsonObject[]> {
  const path = `/api/stories/${fixture.storyId}/characters/${fixture.characterId}/items`;
  const first = await postApi(path, { itemDefinitionId: fixture.definitionId });
  const second = await postApi(path, { itemDefinitionId: fixture.definitionId });
  return [
    responseObjectAt(parseResponse(first), 'item'),
    responseObjectAt(parseResponse(second), 'item'),
  ];
}

async function expectForeignItemDefinitionRejected(fixture: ReusableItemFixture): Promise<void> {
  const otherStory = await createStory('Other story');
  const foreignDefinition = await postApi(`/api/stories/${otherStory.id}/item-definitions`, {
    name: 'Foreign key',
  });
  await postApi(
    `/api/stories/${fixture.storyId}/characters/${fixture.characterId}/items`,
    {
      itemDefinitionId: responseStringAt(parseResponse(foreignDefinition), 'itemDefinition', 'id'),
    },
    404,
  );
}

it('creates reusable item definitions and several owned instances of the same item', async () => {
  const story = await createStory();
  const fixture = await createReusableItemFixture(story.id);
  const [firstItem, secondItem] = await createOwnedItemInstances(fixture);
  expect(firstItem.itemDefinitionId).toBe(fixture.definitionId);
  expect(secondItem.itemDefinitionId).toBe(fixture.definitionId);
  expect(secondItem.id).not.toBe(firstItem.id);
  const loaded = await getApi(`/api/stories/${story.id}`);
  expect(
    responseObjectArrayAt(parseResponse(loaded), 'characters')?.find(
      ({ id }) => id === fixture.characterId,
    )?.items,
  ).toEqual([firstItem, secondItem]);
  await expectForeignItemDefinitionRejected(fixture);
});
type ItemSubtreeFixture = {
  storyId: string;
  miraId: string;
  lucId: string;
  backpackId: string;
  keyId: string;
};

async function createItemSubtreeFixture(): Promise<ItemSubtreeFixture> {
  const story = await createStory();
  const mira = await postApi(`/api/stories/${story.id}/characters`, { name: 'Mira' });
  const luc = await postApi(`/api/stories/${story.id}/characters`, { name: 'Luc' });
  const backpackDefinition = await postApi(`/api/stories/${story.id}/item-definitions`, {
    name: 'Backpack',
  });
  const keyDefinition = await postApi(`/api/stories/${story.id}/item-definitions`, { name: 'Key' });
  const miraId = responseStringAt(parseResponse(mira), 'character', 'id');
  const backpack = await postApi(`/api/stories/${story.id}/characters/${miraId}/items`, {
    itemDefinitionId: responseStringAt(parseResponse(backpackDefinition), 'itemDefinition', 'id'),
  });
  const key = await postApi(`/api/stories/${story.id}/characters/${miraId}/items`, {
    itemDefinitionId: responseStringAt(parseResponse(keyDefinition), 'itemDefinition', 'id'),
  });
  return {
    storyId: story.id,
    miraId,
    lucId: responseStringAt(parseResponse(luc), 'character', 'id'),
    backpackId: responseStringAt(parseResponse(backpack), 'item', 'id'),
    keyId: responseStringAt(parseResponse(key), 'item', 'id'),
  };
}

function itemsForCharacter(response: ApiJsonObject, characterId: string): ApiJsonObject[] {
  const character = required(
    responseObjectArrayAt(response, 'characters').find(({ id }) => id === characterId),
    'The character was missing from the item response.',
  );
  return responseObjectArrayAt(character, 'items');
}

async function nestKeyAndRejectInvalidItemTrees(fixture: ItemSubtreeFixture): Promise<void> {
  const nested = await patchApi(
    `/api/stories/${fixture.storyId}/items/${fixture.keyId}/placement`,
    {
      parentItemId: fixture.backpackId,
      relationshipType: 'contained',
      slotKey: 'main-compartment',
    },
  );
  const nestedKey = required(
    itemsForCharacter(parseResponse(nested), fixture.miraId).find(({ id }) => id === fixture.keyId),
    'The nested key was missing from the response.',
  );
  expect(nestedKey).toMatchObject({
    parentItemId: fixture.backpackId,
    relationshipType: 'contained',
    slotKey: 'main-compartment',
  });
  await patchApi(
    `/api/stories/${fixture.storyId}/items/${fixture.backpackId}/placement`,
    { parentItemId: fixture.keyId, relationshipType: 'contained' },
    400,
  );
  await deleteApi(
    `/api/stories/${fixture.storyId}/characters/${fixture.miraId}/items/${fixture.backpackId}`,
    400,
  );
}

async function transferItemSubtreeToCharacter(fixture: ItemSubtreeFixture): Promise<void> {
  const transferred = await patchApi(
    `/api/stories/${fixture.storyId}/items/${fixture.backpackId}/placement`,
    { characterId: fixture.lucId },
  );
  const response = parseResponse(transferred);
  expect(itemsForCharacter(response, fixture.miraId)).toEqual([]);
  expect(itemsForCharacter(response, fixture.lucId)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: fixture.backpackId }),
      expect.objectContaining({
        id: fixture.keyId,
        parentItemId: fixture.backpackId,
        relationshipType: 'contained',
      }),
    ]),
  );
}

async function transferItemSubtreeToLocation(fixture: ItemSubtreeFixture): Promise<void> {
  const park = await postApi(`/api/stories/${fixture.storyId}/locations`, { name: 'Park' });
  const parkId = responseStringAt(parseResponse(park), 'location', 'id');
  const placed = await patchApi(
    `/api/stories/${fixture.storyId}/items/${fixture.backpackId}/placement`,
    { locationId: parkId },
  );
  const response = parseResponse(placed);
  expect(itemsForCharacter(response, fixture.lucId)).toEqual([]);
  const parkItems = required(
    responseObjectArrayAt(response, 'locations').find(({ id }) => id === parkId),
    'The location was missing from the placement response.',
  );
  expect(responseObjectArrayAt(parkItems, 'items')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: fixture.backpackId }),
      expect.objectContaining({
        id: fixture.keyId,
        parentItemId: fixture.backpackId,
      }),
    ]),
  );
}

it('moves item subtrees between characters and locations and rejects invalid trees', async () => {
  const fixture = await createItemSubtreeFixture();
  await nestKeyAndRejectInvalidItemTrees(fixture);
  await transferItemSubtreeToCharacter(fixture);
  await transferItemSubtreeToLocation(fixture);
});
type ItemStatEffectFixture = {
  storyId: string;
  interactionId: string;
  characterId: string;
  itemDefinitionId: string;
  baseStatDefinitionId: string;
  baseStatAssignmentId: string;
  lockedStatDefinitionId: string;
};

async function createItemStatEffectFixture(): Promise<ItemStatEffectFixture> {
  const story = await createStory();
  const interaction = (await createInteraction(story.id)).interactions[0];
  const character = await postApi(`/api/stories/${story.id}/characters`, { name: 'Mira' });
  const statDefinition = await postApi(`/api/stories/${story.id}/stat-definitions`, {
    name: 'Durability',
  });
  const itemDefinition = await postApi(`/api/stories/${story.id}/item-definitions`, {
    name: 'Key',
    stats: [
      {
        statDefinitionId: responseStringAt(parseResponse(statDefinition), 'statDefinition', 'id'),
        initialValue: 10,
      },
    ],
  });
  const lockedDefinition = await postApi(`/api/stories/${story.id}/stat-definitions`, {
    name: 'Locked',
    valueType: 'boolean',
  });
  return {
    storyId: story.id,
    interactionId: interaction.id,
    characterId: responseStringAt(parseResponse(character), 'character', 'id'),
    itemDefinitionId: responseStringAt(parseResponse(itemDefinition), 'itemDefinition', 'id'),
    baseStatDefinitionId: responseStringAt(parseResponse(statDefinition), 'statDefinition', 'id'),
    baseStatAssignmentId: responseStringAt(
      parseResponse(itemDefinition),
      'itemDefinition',
      'stats',
      0,
      'id',
    ),
    lockedStatDefinitionId: responseStringAt(
      parseResponse(lockedDefinition),
      'statDefinition',
      'id',
    ),
  };
}

async function addLockedItemStatAndInstance(fixture: ItemStatEffectFixture): Promise<string> {
  const extendedDefinition = await patchApi(
    `/api/stories/${fixture.storyId}/item-definitions/${fixture.itemDefinitionId}`,
    {
      stats: [
        {
          id: fixture.baseStatAssignmentId,
          statDefinitionId: fixture.baseStatDefinitionId,
          initialValue: 10,
        },
        {
          id: 'client-temporary-assignment-id',
          statDefinitionId: fixture.lockedStatDefinitionId,
          initialValue: true,
        },
      ],
    },
  );
  const assignments = responseObjectArrayAt(
    parseResponse(extendedDefinition),
    'itemDefinition',
    'stats',
  );
  expect(assignments).toHaveLength(2);
  expect(assignments[0]).toMatchObject({
    id: fixture.baseStatAssignmentId,
    statDefinitionId: fixture.baseStatDefinitionId,
    initialValue: 10,
  });
  expect(assignments[1]).toMatchObject({
    statDefinitionId: fixture.lockedStatDefinitionId,
    initialValue: true,
  });
  const lockedStatAssignmentId = responseStringAt(
    parseResponse(extendedDefinition),
    'itemDefinition',
    'stats',
    1,
    'id',
  );
  expect(lockedStatAssignmentId).not.toBe('client-temporary-assignment-id');
  const item = await postApi(
    `/api/stories/${fixture.storyId}/characters/${fixture.characterId}/items`,
    { itemDefinitionId: fixture.itemDefinitionId },
  );
  return responseStringAt(parseResponse(item), 'item', 'id');
}

async function expectItemStatEffectLifecycle(
  fixture: ItemStatEffectFixture,
  itemId: string,
): Promise<void> {
  const effect = {
    itemId,
    statId: fixture.baseStatAssignmentId,
    operation: 'add',
    value: -2,
  };
  const path = `/api/stories/${fixture.storyId}/interactions/${fixture.interactionId}`;
  const updated = await patchApi(path, { statEffects: [effect] });
  expect(responseObjectArrayAt(parseResponse(updated), 'interaction', 'statEffects')).toEqual([
    effect,
  ]);
  await patchApi(path, { statEffects: [effect, { ...effect, value: 1 }] }, 400);
  await patchApi(path, { statEffects: [{ ...effect, statId: 'unassigned-stat-assignment' }] }, 400);
  await patchApi(`/api/stories/${fixture.storyId}/item-definitions/${fixture.itemDefinitionId}`, {
    stats: [],
  });
  const loaded = await getApi(`/api/stories/${fixture.storyId}`);
  expect(
    responseObjectArrayAt(parseResponse(loaded), 'interactions').find(
      ({ id }) => id === fixture.interactionId,
    )?.statEffects,
  ).toEqual([]);
}

it('validates and stores interaction item stat effects', async () => {
  const fixture = await createItemStatEffectFixture();
  const itemId = await addLockedItemStatAndInstance(fixture);
  await expectItemStatEffectLifecycle(fixture, itemId);
});
type ItemEffectFixture = {
  storyId: string;
  interactionId: string;
  triggerId: string;
  characterId: string;
  itemDefinitionId: string;
  itemId: string;
};

async function createItemEffectFixture(): Promise<ItemEffectFixture> {
  const story = await createStory();
  const interaction = (await createInteraction(story.id)).interactions[0];
  const character = await postApi(`/api/stories/${story.id}/characters`, { name: 'Mira' });
  const definition = await postApi(`/api/stories/${story.id}/item-definitions`, { name: 'Key' });
  const characterId = responseStringAt(parseResponse(character), 'character', 'id');
  const itemDefinitionId = responseStringAt(parseResponse(definition), 'itemDefinition', 'id');
  const item = await postApi(`/api/stories/${story.id}/characters/${characterId}/items`, {
    itemDefinitionId,
  });
  return {
    storyId: story.id,
    interactionId: interaction.id,
    triggerId: interaction.triggers[0].id,
    characterId,
    itemDefinitionId,
    itemId: responseStringAt(parseResponse(item), 'item', 'id'),
  };
}

async function attachExactItemEffect(fixture: ItemEffectFixture): Promise<void> {
  const updated = await patchApi(
    `/api/stories/${fixture.storyId}/interactions/${fixture.interactionId}`,
    { itemEffects: [{ itemId: fixture.itemId, operation: 'obtain' }] },
  );
  expect(responseObjectArrayAt(parseResponse(updated), 'interaction', 'itemEffects')).toEqual([
    { itemId: fixture.itemId, operation: 'obtain' },
  ]);
}

async function attachReusableItemEffectAndCondition(fixture: ItemEffectFixture): Promise<void> {
  const reusableUpdated = await patchApi(
    `/api/stories/${fixture.storyId}/interactions/${fixture.interactionId}`,
    {
      itemEffects: [
        {
          itemDefinitionId: fixture.itemDefinitionId,
          characterId: fixture.characterId,
          operation: 'obtain',
        },
      ],
    },
  );
  expect(
    responseObjectArrayAt(parseResponse(reusableUpdated), 'interaction', 'itemEffects'),
  ).toEqual([
    {
      itemDefinitionId: fixture.itemDefinitionId,
      characterId: fixture.characterId,
      operation: 'obtain',
    },
  ]);
  const conditioned = await patchApi(
    `/api/stories/${fixture.storyId}/interactions/${fixture.interactionId}/triggers/${fixture.triggerId}`,
    {
      inputInteractionIds: [],
      conditions: [{ itemDefinitionId: fixture.itemDefinitionId, isOwned: true }],
    },
  );
  expect(
    responseObjectArrayAt(
      parseResponse(conditioned),
      'trigger',
      'conditionGroups',
      0,
      'conditions',
    ),
  ).toEqual([{ itemDefinitionId: fixture.itemDefinitionId, isOwned: true }]);
}

async function rejectInvalidItemEffects(fixture: ItemEffectFixture): Promise<void> {
  const path = `/api/stories/${fixture.storyId}/interactions/${fixture.interactionId}`;
  await patchApi(
    path,
    {
      itemEffects: [
        { itemId: fixture.itemId, operation: 'obtain' },
        { itemId: fixture.itemId, operation: 'lose' },
      ],
    },
    400,
  );
  await patchApi(path, { itemEffects: [{ itemId: 'foreign-item', operation: 'obtain' }] }, 400);
  await patchApi(
    path,
    {
      itemEffects: [
        { itemId: fixture.itemId, itemDefinitionId: fixture.itemDefinitionId, operation: 'obtain' },
      ],
    },
    400,
  );
}

it('validates and stores interaction item effects', async () => {
  const fixture = await createItemEffectFixture();
  await attachExactItemEffect(fixture);
  await attachReusableItemEffectAndCondition(fixture);
  await rejectInvalidItemEffects(fixture);
});
type ItemReferenceCleanupFixture = {
  storyId: string;
  interactionId: string;
  triggerId: string;
  characterId: string;
  statId: string;
  itemDefinitionId: string;
  itemId: string;
  itemStatAssignmentId: string;
};

async function createItemReferenceCleanupFixture(): Promise<ItemReferenceCleanupFixture> {
  const story = await createStory();
  const interaction = (await createInteraction(story.id)).interactions[0];
  const character = await postApi(`/api/stories/${story.id}/characters`, { name: 'Mira' });
  const statDefinition = await postApi(`/api/stories/${story.id}/stat-definitions`, {
    name: 'Trust',
  });
  const characterId = responseStringAt(parseResponse(character), 'character', 'id');
  const statDefinitionId = responseStringAt(parseResponse(statDefinition), 'statDefinition', 'id');
  const stat = await postApi(`/api/stories/${story.id}/characters/${characterId}/stats`, {
    statDefinitionId,
    initialValue: 2,
  });
  const itemDefinition = await postApi(`/api/stories/${story.id}/item-definitions`, {
    name: 'Key',
    stats: [{ statDefinitionId, initialValue: 10 }],
  });
  const itemDefinitionId = responseStringAt(parseResponse(itemDefinition), 'itemDefinition', 'id');
  const item = await postApi(`/api/stories/${story.id}/characters/${characterId}/items`, {
    itemDefinitionId,
  });
  return {
    storyId: story.id,
    interactionId: interaction.id,
    triggerId: interaction.triggers[0].id,
    characterId,
    statId: responseStringAt(parseResponse(stat), 'stat', 'id'),
    itemDefinitionId,
    itemId: responseStringAt(parseResponse(item), 'item', 'id'),
    itemStatAssignmentId: responseStringAt(
      parseResponse(itemDefinition),
      'itemDefinition',
      'stats',
      0,
      'id',
    ),
  };
}

async function attachCleanupReferences(fixture: ItemReferenceCleanupFixture): Promise<void> {
  await patchApi(`/api/stories/${fixture.storyId}/interactions/${fixture.interactionId}`, {
    statEffects: [
      { statId: fixture.statId, operation: 'add', value: 1 },
      { itemId: fixture.itemId, statId: fixture.itemStatAssignmentId, operation: 'add', value: -1 },
    ],
    itemEffects: [{ itemId: fixture.itemId, operation: 'obtain' }],
  });
  await patchApi(
    `/api/stories/${fixture.storyId}/interactions/${fixture.interactionId}/triggers/${fixture.triggerId}`,
    {
      inputInteractionIds: [],
      conditions: [{ statId: fixture.statId, operator: 'gte', value: 2 }],
    },
  );
}

async function deleteCharacterStatAndVerifyCleanup(
  fixture: ItemReferenceCleanupFixture,
): Promise<void> {
  const withoutStat = await deleteApi(
    `/api/stories/${fixture.storyId}/characters/${fixture.characterId}/stats/${fixture.statId}`,
  );
  expect(parseResponse(withoutStat)).toMatchObject({
    characterId: fixture.characterId,
    statId: fixture.statId,
  });
  expect(parseResponse(withoutStat)).not.toHaveProperty('interactions');
  const afterStatDelete = await getApi(`/api/stories/${fixture.storyId}`);
  expect(responseObjectArrayAt(parseResponse(afterStatDelete), 'characters', 0, 'stats')).toEqual(
    [],
  );
  expect(
    responseObjectArrayAt(parseResponse(afterStatDelete), 'interactions', 0, 'statEffects'),
  ).toEqual([
    expect.objectContaining({
      itemId: fixture.itemId,
    }),
  ]);
  expect(
    triggerConditions(
      responseObjectAt(parseResponse(afterStatDelete), 'interactions', 0, 'triggers', 0),
    ),
  ).toEqual([]);
}

async function deleteItemAndVerifyEffectCleanup(
  fixture: ItemReferenceCleanupFixture,
): Promise<void> {
  const withoutItem = await deleteApi(
    `/api/stories/${fixture.storyId}/characters/${fixture.characterId}/items/${fixture.itemId}`,
  );
  expect(parseResponse(withoutItem)).toMatchObject({
    characterId: fixture.characterId,
    itemId: fixture.itemId,
  });
  expect(parseResponse(withoutItem)).not.toHaveProperty('interactions');
  const afterItemDelete = await getApi(`/api/stories/${fixture.storyId}`);
  expect(responseObjectArrayAt(parseResponse(afterItemDelete), 'characters', 0, 'items')).toEqual(
    [],
  );
  expect(
    responseObjectArrayAt(parseResponse(afterItemDelete), 'interactions', 0, 'itemEffects'),
  ).toEqual([]);
  expect(
    responseObjectArrayAt(parseResponse(afterItemDelete), 'interactions', 0, 'statEffects'),
  ).toEqual([]);
}

it('removes character stats and items with their exact-instance references', async () => {
  const fixture = await createItemReferenceCleanupFixture();
  await attachCleanupReferences(fixture);
  await deleteCharacterStatAndVerifyCleanup(fixture);
  await deleteItemAndVerifyEffectCleanup(fixture);
});
async function createCharacterStatAssignment(storyId: string): Promise<string> {
  const character = await postApi(`/api/stories/${storyId}/characters`, { name: 'Mira' });
  const definition = await postApi(`/api/stories/${storyId}/stat-definitions`, { name: 'Trust' });
  const stat = await postApi(
    `/api/stories/${storyId}/characters/${responseStringAt(parseResponse(character), 'character', 'id')}/stats`,
    {
      statDefinitionId: responseStringAt(parseResponse(definition), 'statDefinition', 'id'),
      initialValue: 0,
    },
  );
  return responseStringAt(parseResponse(stat), 'stat', 'id');
}

it('rejects foreign stat references and duplicate effects', async () => {
  const first = await createStory('First story');
  const target = (await createInteraction(first.id)).interactions[0];
  const localStatId = await createCharacterStatAssignment(first.id);
  const second = await createStory('Second story');
  const foreignStatId = await createCharacterStatAssignment(second.id);
  await patchApi(
    `/api/stories/${first.id}/interactions/${target.id}`,
    { statEffects: [{ statId: foreignStatId, operation: 'add', value: 1 }] },
    400,
  );
  await patchApi(
    `/api/stories/${first.id}/interactions/${target.id}`,
    {
      statEffects: [
        { statId: localStatId, operation: 'add', value: 1 },
        { statId: localStatId, operation: 'set', value: 2 },
      ],
    },
    400,
  );
});
it('rejects character references from another story', async () => {
  const first = await createStory('First story');
  const firstGraph = await createInteraction(first.id);
  const target = firstGraph.interactions[0];
  const second = await createStory('Second story');
  const foreignResponse = await postApi(
    `/api/stories/${second.id}/characters`,
    { name: 'Foreign character' },
    201,
  );
  const foreign = responseObjectAt(parseResponse(foreignResponse), 'character');
  await patchApi(
    `/api/stories/${first.id}/interactions/${target.id}`,
    { characterIds: [required(foreign, 'Expected this response value to be present.').id] },
    400,
  );
  await patchApi(
    `/api/stories/${first.id}/interactions/${target.id}/triggers/${target.triggers[0].id}`,
    {
      inputInteractionIds: [],
      conditions: [
        {
          characterId: required(foreign, 'Expected this response value to be present.').id,
          isPresent: true,
        },
      ],
    },
    400,
  );
});
it('DELETE /api/stories/:storyId/interactions/:interactionId/triggers/:triggerId deletes a trigger', async () => {
  const story = await createStory();
  const withInteraction = await createInteraction(story.id);
  const interaction = withInteraction.interactions[0];
  const withSecondTrigger = await request(httpServer)
    .post(`/api/stories/${story.id}/interactions/${interaction.id}/triggers`)
    .expect(201);
  const createdTrigger = responseObjectAt(parseResponse(withSecondTrigger), 'trigger');
  const trigger = interaction.triggers[0];
  const response = await deleteApi(
    `/api/stories/${story.id}/interactions/${interaction.id}/triggers/${trigger.id}`,
    200,
  );
  expect(parseResponse(response)).toMatchObject({
    interactionId: interaction.id,
    triggerId: trigger.id,
    triggerRemoved: true,
  });
  expect(parseResponse(response)).not.toHaveProperty('interactions');
  const afterDelete = await getApi(`/api/stories/${story.id}`, 200);
  expect(
    responseObjectArrayAt(parseResponse(afterDelete), 'interactions', 0, 'triggers'),
  ).toHaveLength(1);
  expect(responseStringAt(parseResponse(afterDelete), 'interactions', 0, 'triggers', 0, 'id')).toBe(
    required(createdTrigger, 'Expected this response value to be present.').id,
  );
});
it('DELETE /api/stories/:storyId/interactions/:interactionId/triggers/:triggerId turns the last trigger into a root trigger', async () => {
  const story = await createStory();
  const withParent = await createInteraction(story.id);
  const parent = withParent.interactions[0];
  const withInteraction = await createInteraction(story.id, { parentId: parent.id });
  const interaction = required(
    withInteraction.interactions.find((item) => item.id !== parent.id),
    'The child interaction was not returned.',
  );
  const trigger = interaction.triggers[0];
  const response = await deleteApi(
    `/api/stories/${story.id}/interactions/${interaction.id}/triggers/${trigger.id}`,
    200,
  );
  expect(parseResponse(response)).toMatchObject({
    interactionId: interaction.id,
    triggerId: trigger.id,
    triggerRemoved: false,
  });
  const afterDelete = await getApi(`/api/stories/${story.id}`, 200);
  const updatedInteraction = required(
    responseObjectArrayAt(parseResponse(afterDelete), 'interactions').find(
      (item) => item.id === interaction.id,
    ),
    'The interaction was not found after trigger deletion.',
  );
  expect(updatedInteraction.triggers).toEqual([{ ...trigger, inputInteractionIds: [] }]);
});
it('returns 404 for unknown story ids', async () => {
  await getApi('/api/stories/missing-story', 404);
});
it('isolates stories between authenticated owners', async () => {
  const created = await request(httpServer)
    .post('/api/stories')
    .set('Cookie', 'paralleax_session=user-one')
    .send({ title: 'Private story' })
    .expect(201);
  const otherList = await request(httpServer)
    .get('/api/stories')
    .set('Cookie', 'paralleax_session=user-two')
    .expect(200);
  expect(responseObjectArrayAt(parseResponse(otherList), 'items')).toEqual([]);
  await request(httpServer)
    .get(`/api/stories/${responseStringAt(parseResponse(created), 'id')}`)
    .set('Cookie', 'paralleax_session=user-two')
    .expect(404);
});
type PermissionFixture = {
  storyId: string;
  rootInteractionId: string;
  ownerCookie: string;
  collaboratorCookie: string;
};

async function inviteReaderAndValidateInvitation(fixture: PermissionFixture): Promise<void> {
  const { storyId, ownerCookie } = fixture;
  await request(httpServer)
    .patch(`/api/stories/${storyId}/access`)
    .set('Cookie', ownerCookie)
    .send({ visibility: 'invitation', editPolicy: 'collaborators', commentPolicy: 'readers' })
    .expect(200);
  await request(httpServer)
    .post(`/api/stories/${storyId}/access/collaborators`)
    .set('Cookie', ownerCookie)
    .send({ email: 'not-an-email', role: 'viewer' })
    .expect(400);
  const invalidInvitation = await request(httpServer)
    .post(`/api/stories/${storyId}/access/collaborators`)
    .set('Cookie', ownerCookie)
    .send({ email: 'missing@example.com', role: 'viewer' })
    .expect(400);
  expect(responseStringAt(parseResponse(invalidInvitation), 'code')).toBe(
    'COLLABORATOR_ACCOUNT_INVALID',
  );
  const invitation = await request(httpServer)
    .post(`/api/stories/${storyId}/access/collaborators`)
    .set('Cookie', ownerCookie)
    .send({ email: 'user-two@paralleax.invalid', role: 'viewer' })
    .expect(201);
  expect(responseObjectArrayAt(parseResponse(invitation), 'collaborators')).toEqual([
    expect.objectContaining({ userId: 'user-2', role: 'viewer' }),
  ]);
}

async function expectReaderAndAnonymousRestrictions(fixture: PermissionFixture): Promise<void> {
  const { storyId, collaboratorCookie, rootInteractionId } = fixture;
  const readable = await request(httpServer)
    .get(`/api/stories/${storyId}`)
    .set('Cookie', collaboratorCookie)
    .expect(200);
  expect(responseObjectAt(parseResponse(readable), 'capabilities')).toMatchObject({
    canRead: true,
    canEdit: false,
  });
  await request(httpServer)
    .get(`/api/stories/${storyId}`)
    .set('Cookie', 'paralleax_session=anonymous')
    .expect(404);
  await request(httpServer)
    .patch(`/api/stories/${storyId}`)
    .set('Cookie', 'paralleax_session=anonymous')
    .send({ title: 'Sign-in required' })
    .expect(401);
  await request(httpServer)
    .patch(`/api/stories/${storyId}`)
    .set('Cookie', collaboratorCookie)
    .send({ title: 'Forbidden rename' })
    .expect(403);
  await request(httpServer)
    .post(`/api/stories/${storyId}/interactions`)
    .set('Cookie', collaboratorCookie)
    .send({ position: { x: 40, y: 80 } })
    .expect(403);
  await request(httpServer)
    .patch(`/api/stories/${storyId}/interactions/${rootInteractionId}`)
    .set('Cookie', collaboratorCookie)
    .send({ title: 'Forbidden scene' })
    .expect(403);
  await request(httpServer)
    .patch(`/api/stories/${storyId}/access`)
    .set('Cookie', collaboratorCookie)
    .send({ visibility: 'public', editPolicy: 'owner', commentPolicy: 'editors' })
    .expect(403);
  await request(httpServer)
    .get(`/api/stories/${storyId}/access`)
    .set('Cookie', collaboratorCookie)
    .expect(403);
  await request(httpServer)
    .delete(`/api/stories/${storyId}`)
    .set('Cookie', collaboratorCookie)
    .expect(403);
}

async function promoteAndRevokeEditor(fixture: PermissionFixture): Promise<void> {
  const { storyId, ownerCookie, collaboratorCookie } = fixture;
  await request(httpServer)
    .post(`/api/stories/${storyId}/access/collaborators`)
    .set('Cookie', ownerCookie)
    .send({ email: 'user-two@paralleax.invalid', role: 'editor' })
    .expect(201);
  await request(httpServer)
    .patch(`/api/stories/${storyId}`)
    .set('Cookie', collaboratorCookie)
    .send({ title: 'Collaborative rename' })
    .expect(200);
  await request(httpServer)
    .delete(`/api/stories/${storyId}/access/collaborators/user-2`)
    .set('Cookie', ownerCookie)
    .expect(204);
  await request(httpServer)
    .get(`/api/stories/${storyId}/editor`)
    .set('Cookie', collaboratorCookie)
    .expect(404);
  await request(httpServer)
    .patch(`/api/stories/${storyId}`)
    .set('Cookie', collaboratorCookie)
    .send({ title: 'Rename after revocation' })
    .expect(404);
  const canonical = await request(httpServer)
    .get(`/api/stories/${storyId}`)
    .set('Cookie', ownerCookie)
    .expect(200);
  expect(responseStringAt(parseResponse(canonical), 'title')).toBe('Collaborative rename');
}

it('enforces invited reader, editor, and revoked permissions on existing story endpoints', async () => {
  const story = await createStory('Shared story');
  const interaction = (await createInteraction(story.id)).interactions[0];
  const fixture: PermissionFixture = {
    storyId: story.id,
    rootInteractionId: interaction.id,
    ownerCookie: 'paralleax_session=test-user',
    collaboratorCookie: 'paralleax_session=user-two',
  };
  await inviteReaderAndValidateInvitation(fixture);
  await expectReaderAndAnonymousRestrictions(fixture);
  await promoteAndRevokeEditor(fixture);
});

it('publishes story invalidations for authored, access, and deletion mutations', async () => {
  const events = app.get(StoryEventsService);
  const publish = jest.spyOn(events, 'publish');
  const created = await createStory('Live collaboration');
  await postApi(`/api/stories/${created.id}/interactions`, { position: { x: 40, y: 80 } }, 201);
  await postApi(
    `/api/stories/${created.id}/graph-decorations`,
    { kind: 'text', position: { x: 20, y: 30 } },
    201,
  );
  await patchApi(
    `/api/stories/${created.id}/access`,
    { visibility: 'public', editPolicy: 'owner', commentPolicy: 'editors' },
    200,
  );
  await deleteApi(`/api/stories/${created.id}`, 204);
  expect(publish.mock.calls.map(([event]) => event)).toEqual([
    expect.objectContaining({ storyId: created.id, change: 'updated', revision: 2 }),
    expect.objectContaining({ storyId: created.id, change: 'updated', revision: 3 }),
    expect.objectContaining({ storyId: created.id, change: 'access-updated' }),
    expect.objectContaining({ storyId: created.id, change: 'deleted' }),
  ]);
});
it('does not expose the authoring event stream to readers', async () => {
  const created = await request(httpServer)
    .post('/api/stories')
    .set('Cookie', 'paralleax_session=user-one')
    .send({ title: 'Readable but not editable' })
    .expect(201);
  await request(httpServer)
    .patch(`/api/stories/${responseStringAt(parseResponse(created), 'id')}/access`)
    .set('Cookie', 'paralleax_session=user-one')
    .send({ visibility: 'public', editPolicy: 'owner', commentPolicy: 'editors' })
    .expect(200);
  await request(httpServer)
    .get(`/api/stories/${responseStringAt(parseResponse(created), 'id')}/events`)
    .set('Cookie', 'paralleax_session=user-two')
    .expect(403);
});
it('rejects removed comment policies at the API boundary', async () => {
  const story = await createStory('Current comment policies');
  await patchApi(
    `/api/stories/${story.id}/access`,
    { visibility: 'private', editPolicy: 'owner', commentPolicy: 'disabled' },
    400,
  );
  await patchApi(
    `/api/stories/${story.id}/access`,
    { visibility: 'private', editPolicy: 'owner', commentPolicy: 'authenticated' },
    400,
  );
});
it('exposes public stories to other users without granting modification', async () => {
  const created = await request(httpServer)
    .post('/api/stories')
    .set('Cookie', 'paralleax_session=user-one')
    .send({ title: 'Public story' })
    .expect(201);
  await request(httpServer)
    .patch(`/api/stories/${responseStringAt(parseResponse(created), 'id')}/access`)
    .set('Cookie', 'paralleax_session=user-one')
    .send({ visibility: 'public', editPolicy: 'owner', commentPolicy: 'editors' })
    .expect(200);
  const response = await request(httpServer)
    .get(`/api/stories/${responseStringAt(parseResponse(created), 'id')}`)
    .set('Cookie', 'paralleax_session=anonymous')
    .expect(200);
  expect(responseObjectAt(parseResponse(response), 'capabilities')).toMatchObject({
    canRead: true,
    canEdit: false,
  });
});
it('lists only public stories without authentication', async () => {
  const privateStory = await request(httpServer)
    .post('/api/stories')
    .set('Cookie', 'paralleax_session=user-one')
    .send({ title: 'Private story' })
    .expect(201);
  const publicStory = await request(httpServer)
    .post('/api/stories')
    .set('Cookie', 'paralleax_session=user-one')
    .send({ title: 'Public catalogue story' })
    .expect(201);
  await request(httpServer)
    .patch(`/api/stories/${responseStringAt(parseResponse(publicStory), 'id')}/access`)
    .set('Cookie', 'paralleax_session=user-one')
    .send({ visibility: 'public', editPolicy: 'owner', commentPolicy: 'editors' })
    .expect(200);
  const response = await getApi('/api/stories/public', 200);
  const publicItems = responseObjectArrayAt(parseResponse(response), 'items');
  expect(publicItems).toEqual([
    expect.objectContaining({
      id: responseStringAt(parseResponse(publicStory), 'id'),
      title: 'Public catalogue story',
    }),
  ]);
  expect(
    responseObjectAt(
      required(publicItems[0], 'Expected a public story to be present.'),
      'capabilities',
    ),
  ).toMatchObject({ canRead: true, canEdit: false, canManage: false });
  expect(responseObjectAt(parseResponse(response), 'items', 0)).toHaveProperty('owner', {
    id: 'user-1',
    displayName: 'User One',
  });
  expect(responseObjectAt(parseResponse(response), 'items', 0, 'owner')).not.toHaveProperty(
    'email',
  );
  expect(responseObjectArrayAt(parseResponse(response), 'items')).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: responseStringAt(parseResponse(privateStory), 'id') }),
    ]),
  );
});
it('reads unlisted stories by URL and keeps them out of catalogs without a direct grant', async () => {
  const created = await request(httpServer)
    .post('/api/stories')
    .set('Cookie', 'paralleax_session=user-one')
    .send({ title: 'Link-only story' })
    .expect(201);
  await request(httpServer)
    .patch(`/api/stories/${responseStringAt(parseResponse(created), 'id')}/access`)
    .set('Cookie', 'paralleax_session=user-one')
    .send({ visibility: 'unlisted', editPolicy: 'authenticated', commentPolicy: 'readers' })
    .expect(200);
  const anonymousRead = await request(httpServer)
    .get(`/api/stories/${responseStringAt(parseResponse(created), 'id')}`)
    .set('Cookie', 'paralleax_session=anonymous')
    .expect(200);
  expect(responseObjectAt(parseResponse(anonymousRead), 'capabilities')).toMatchObject({
    canRead: true,
    canEdit: false,
  });
  const publicCatalog = await getApi('/api/stories/public', 200);
  expect(responseObjectArrayAt(parseResponse(publicCatalog), 'items')).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: responseStringAt(parseResponse(created), 'id') }),
    ]),
  );
  const ungrantedLibrary = await request(httpServer)
    .get('/api/stories')
    .set('Cookie', 'paralleax_session=user-two')
    .expect(200);
  expect(responseObjectArrayAt(parseResponse(ungrantedLibrary), 'items')).not.toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: responseStringAt(parseResponse(created), 'id') }),
    ]),
  );
  await request(httpServer)
    .post(`/api/stories/${responseStringAt(parseResponse(created), 'id')}/access/collaborators`)
    .set('Cookie', 'paralleax_session=user-one')
    .send({ email: 'user-two@paralleax.invalid', role: 'viewer' })
    .expect(201);
  const grantedLibrary = await request(httpServer)
    .get('/api/stories')
    .set('Cookie', 'paralleax_session=user-two')
    .expect(200);
  expect(responseObjectArrayAt(parseResponse(grantedLibrary), 'items')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: responseStringAt(parseResponse(created), 'id') }),
    ]),
  );
});
