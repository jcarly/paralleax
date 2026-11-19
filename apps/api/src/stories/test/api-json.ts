/**
 * Typed JSON readers for Stories API specs. Supertest returns untyped bodies;
 * these helpers validate the response shape before assertions read it.
 */
export type ApiJsonValue = string | number | boolean | null | ApiJsonObject | ApiJsonValue[];
export interface ApiJsonObject {
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
  locationId?: string | null;
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
  ['locationId', isNullableString],
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
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isNullableString(value: unknown): boolean {
  return value === null || typeof value === 'string';
}
export function isNullableNumber(value: unknown): boolean {
  return value === null || typeof value === 'number';
}
export function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
export function isNumberRecord(value: unknown): boolean {
  return isRecord(value) && Object.values(value).every((item) => typeof item === 'number');
}
export function isJsonObject(value: unknown): value is ApiJsonObject {
  return isRecord(value) && isApiJsonValue(value);
}
export function isJsonObjectArray(value: unknown): boolean {
  return Array.isArray(value) && value.every(isJsonObject);
}
export function isValidJsonField(key: string, value: unknown): boolean {
  return jsonFieldValidators.get(key)?.(value) ?? isApiJsonValue(value);
}
export function isApiJsonValue(value: unknown): value is ApiJsonValue {
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
export function parseJsonValue(text: string): ApiJsonValue {
  const parsed: unknown = JSON.parse(text) as unknown;
  if (!isApiJsonValue(parsed)) {
    throw new Error('Expected a valid JSON response value.');
  }
  return parsed;
}
export function parseResponse(response: { text: string }): ApiJsonObject {
  const parsed = parseJsonValue(response.text);
  if (!isRecord(parsed)) {
    throw new Error('Expected an object-shaped JSON API response.');
  }
  return parsed;
}
export function parseResponseArray(response: { text: string }): ApiJsonObject[] {
  const parsed = parseJsonValue(response.text);
  if (!Array.isArray(parsed) || !parsed.every(isJsonObject)) {
    throw new Error('Expected an array of object-shaped JSON API responses.');
  }
  return parsed;
}
export function required<T>(value: T | undefined, message: string): T {
  if (value === undefined) {
    throw new Error(message);
  }
  return value;
}
export function requiredString(value: unknown, message: string): string {
  if (typeof value !== 'string') {
    throw new Error(message);
  }
  return value;
}
export function requiredJsonObject(value: unknown, message: string): ApiJsonObject {
  if (!isJsonObject(value)) {
    throw new Error(message);
  }
  return value;
}
export function responseValueAt(
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
export function responseObjectAt(
  root: ApiJsonObject,
  ...path: Array<string | number>
): ApiJsonObject {
  return requiredJsonObject(responseValueAt(root, ...path), 'Expected a response object.');
}
export function responseObjectArrayAt(
  root: ApiJsonObject,
  ...path: Array<string | number>
): ApiJsonObject[] {
  const value = responseValueAt(root, ...path);
  if (!Array.isArray(value) || !value.every(isJsonObject)) {
    throw new Error('Expected an array of response objects.');
  }
  return value;
}
export function responseStringArrayAt(
  root: ApiJsonObject,
  ...path: Array<string | number>
): string[] {
  const value = responseValueAt(root, ...path);
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error('Expected an array of response strings.');
  }
  return value;
}
export function responseStringAt(root: ApiJsonObject, ...path: Array<string | number>): string {
  const value = responseValueAt(root, ...path);
  if (typeof value !== 'string') {
    throw new Error('Expected a string response value.');
  }
  return value;
}
export function responseNumberAt(root: ApiJsonObject, ...path: Array<string | number>): number {
  const value = responseValueAt(root, ...path);
  if (typeof value !== 'number') {
    throw new Error('Expected a numeric response value.');
  }
  return value;
}
export function triggerConditions(trigger: ApiJsonObject): ApiJsonObject[] {
  return (trigger.conditionGroups ?? []).flatMap((group) => group.conditions ?? []);
}
