import { validateStoryGroups } from '../operations/groups.js';
import type { Story } from '../model/stories.js';
import { diffStoryGraphPositions, type StoryGraphPositionPatch } from '../graph/positions.js';
import { toCanonicalTrigger } from '../triggers/model.js';
import type { UserDisplayIdentity } from '../user-identity.js';

export type StoryHistoryEventKind = 'change' | 'undo' | 'redo';

export const storyHistoryOperations = {
  storyUpdated: 'story.updated',
  storyMetadataUpdated: 'story.metadata.updated',
  interactionCreated: 'interaction.created',
  interactionUpdated: 'interaction.updated',
  interactionDeleted: 'interaction.deleted',
  graphPositionsUpdated: 'graph.positions.updated',
  triggerCreated: 'trigger.created',
  triggerUpdated: 'trigger.updated',
  triggerDeleted: 'trigger.deleted',
  graphDecorationCreated: 'graph-decoration.created',
  graphDecorationUpdated: 'graph-decoration.updated',
  graphDecorationDeleted: 'graph-decoration.deleted',
  groupCreated: 'group.created',
  groupUpdated: 'group.updated',
  groupDeleted: 'group.deleted',
  locationCreated: 'location.created',
  locationUpdated: 'location.updated',
  characterCreated: 'character.created',
  characterUpdated: 'character.updated',
  statDefinitionCreated: 'stat-definition.created',
  statDefinitionUpdated: 'stat-definition.updated',
  statDefinitionDeleted: 'stat-definition.deleted',
  statAssignmentCreated: 'stat-assignment.created',
  statAssignmentUpdated: 'stat-assignment.updated',
  statAssignmentDeleted: 'stat-assignment.deleted',
  itemDefinitionCreated: 'item-definition.created',
  itemDefinitionUpdated: 'item-definition.updated',
  itemInstanceCreated: 'item-instance.created',
  itemInstanceMoved: 'item-instance.moved',
  itemInstanceDeleted: 'item-instance.deleted',
} as const;

export type StoryHistoryOperation =
  (typeof storyHistoryOperations)[keyof typeof storyHistoryOperations];

export type StoryHistoryActor = UserDisplayIdentity;

export interface StoryHistoryEntry {
  id: string;
  revision: number;
  kind: StoryHistoryEventKind;
  operation: string;
  actor?: StoryHistoryActor;
  createdAt: string;
  reverted: boolean;
}

export interface StoryHistory {
  entries: StoryHistoryEntry[];
  canUndo: boolean;
  canRedo: boolean;
}

export type StoryHistoryMutationResult =
  | {
      story: Story;
      history: StoryHistory;
    }
  | {
      storyId: string;
      graphPositions: StoryGraphPositionPatch;
      revision: number;
      updatedAt: string;
      history: StoryHistory;
    };

/** Uses a compact response for graph-only history mutations and the full Story otherwise. */
export function createStoryHistoryMutationResult(
  before: Story,
  after: Story,
  changes: StoryChangeDelta,
  history: StoryHistory,
): StoryHistoryMutationResult {
  if (isStoryGraphPositionDelta(changes) && after.revision !== undefined) {
    return {
      storyId: after.id,
      graphPositions: diffStoryGraphPositions(before, after),
      revision: after.revision,
      updatedAt: after.updatedAt,
      history,
    };
  }
  return { story: after, history };
}

type JsonPrimitive = null | boolean | number | string;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };
type EntityJsonObject = JsonObject & { id: string };

interface ValueDelta {
  kind: 'value';
  beforeExists: boolean;
  afterExists: boolean;
  before?: JsonValue;
  after?: JsonValue;
}

interface ObjectDelta {
  kind: 'object';
  fields: Record<string, StoryChangeDelta>;
}

interface EntityPlacement {
  index: number;
  previousId?: string;
  nextId?: string;
}

interface EntityDeltaEntry {
  delta?: StoryChangeDelta;
  move?: boolean;
  before: EntityPlacement;
  after: EntityPlacement;
}

interface EntityArrayDelta {
  kind: 'entities';
  entries: Record<string, EntityDeltaEntry>;
}

export type StoryChangeDelta = ValueDelta | ObjectDelta | EntityArrayDelta;

export interface StoryChangeConflict {
  path: string;
}

export type StoryChangeApplication =
  { applied: true; story: Story } | { applied: false; conflicts: StoryChangeConflict[] };

const authoredStoryKeys = [
  'id',
  'title',
  'startDateTime',
  'locations',
  'characters',
  'stats',
  'statDefinitions',
  'itemDefinitions',
  'groups',
  'graphDecorations',
  'interactions',
] as const;

/**
 * Builds a compact, reversible delta for canonical authored Story content.
 * Access, capabilities, ownership, timestamps, and revisions deliberately stay
 * outside this projection because they have different lifecycles.
 */
export function createStoryChangeDelta(before: Story, after: Story): StoryChangeDelta | undefined {
  return createDelta(true, authoredStoryProjection(before), true, authoredStoryProjection(after));
}

/** Returns the exact reversible event representing the opposite change. */
export function invertStoryChangeDelta(delta: StoryChangeDelta): StoryChangeDelta {
  if (delta.kind === 'value') {
    return {
      kind: 'value',
      beforeExists: delta.afterExists,
      afterExists: delta.beforeExists,
      ...(delta.afterExists ? { before: delta.after } : {}),
      ...(delta.beforeExists ? { after: delta.before } : {}),
    };
  }
  if (delta.kind === 'object') {
    return {
      kind: 'object',
      fields: Object.fromEntries(
        Object.entries(delta.fields).map(([key, field]) => [key, invertStoryChangeDelta(field)]),
      ),
    };
  }
  return {
    kind: 'entities',
    entries: Object.fromEntries(
      Object.entries(delta.entries).map(([id, entry]) => [
        id,
        {
          ...(entry.delta ? { delta: invertStoryChangeDelta(entry.delta) } : {}),
          ...(entry.move ? { move: true } : {}),
          before: { ...entry.after },
          after: { ...entry.before },
        },
      ]),
    ),
  };
}

/** Identifies a delta that changes only existing interaction or Trigger positions. */
export function isStoryGraphPositionDelta(delta: StoryChangeDelta): boolean {
  if (delta.kind !== 'object' || Object.keys(delta.fields).length !== 1) {
    return false;
  }
  const interactions = delta.fields.interactions;
  if (!interactions || interactions.kind !== 'entities') {
    return false;
  }
  const entries = Object.values(interactions.entries);
  return entries.length > 0 && entries.every(isInteractionGraphPositionEntry);
}

function isInteractionGraphPositionEntry(entry: EntityDeltaEntry): boolean {
  if (entry.move || !entry.delta || entry.delta.kind !== 'object') {
    return false;
  }
  const fields = Object.entries(entry.delta.fields);
  return (
    fields.length > 0 &&
    fields.every(([key, delta]) => {
      if (key === 'position') {
        return isPositionDelta(delta);
      }
      if (key !== 'triggers' || delta.kind !== 'entities') {
        return false;
      }
      const triggerEntries = Object.values(delta.entries);
      return triggerEntries.length > 0 && triggerEntries.every(isTriggerGraphPositionEntry);
    })
  );
}

function isTriggerGraphPositionEntry(entry: EntityDeltaEntry): boolean {
  if (entry.move || !entry.delta || entry.delta.kind !== 'object') {
    return false;
  }
  const fields = Object.entries(entry.delta.fields);
  return fields.length === 1 && fields[0][0] === 'position' && isPositionDelta(fields[0][1]);
}

function isPositionDelta(delta: StoryChangeDelta): boolean {
  if (delta.kind === 'value') {
    return (
      (!delta.beforeExists || isPositionValue(delta.before)) &&
      (!delta.afterExists || isPositionValue(delta.after))
    );
  }
  if (delta.kind !== 'object') {
    return false;
  }
  const fields = Object.entries(delta.fields);
  return (
    fields.length > 0 &&
    fields.every(([key, field]) => (key === 'x' || key === 'y') && field.kind === 'value')
  );
}

function isPositionValue(value: JsonValue | undefined): boolean {
  return isJsonObject(value) && typeof value.x === 'number' && typeof value.y === 'number';
}

/**
 * Applies a recorded change either in its original direction or in reverse.
 * Every changed value is checked against the value originally observed on that
 * side of the event, so unrelated later edits survive while overlapping edits
 * produce an explicit conflict.
 */
export function applyStoryChangeDelta(
  current: Story,
  delta: StoryChangeDelta,
  direction: 'forward' | 'backward',
): StoryChangeApplication {
  const conflicts: StoryChangeConflict[] = [];
  const result = applyDelta(true, authoredStoryProjection(current), delta, {
    direction,
    path: '$',
    conflicts,
  });
  if (conflicts.length > 0 || !result.exists || !isJsonObject(result.value)) {
    return {
      applied: false,
      conflicts: conflicts.length > 0 ? conflicts : [{ path: '$' }],
    };
  }

  const story = structuredClone(current);
  for (const key of authoredStoryKeys) {
    Reflect.deleteProperty(story, key);
  }
  Object.assign(story, result.value);
  if (validateStoryGroups(story)) {
    return { applied: false, conflicts: [{ path: '$.groups' }] };
  }
  return { applied: true, story };
}

function authoredStoryProjection(story: Story): JsonValue {
  return toJsonValue({
    id: story.id,
    title: story.title,
    ...(story.startDateTime === undefined ? {} : { startDateTime: story.startDateTime }),
    locations: (story.locations ?? []).map((location) => ({
      ...location,
      stats: location.stats ?? [],
      items: location.items ?? [],
    })),
    characters: (story.characters ?? []).map((character) => ({
      ...character,
      stats: character.stats ?? [],
      items: character.items ?? [],
    })),
    stats: story.stats ?? [],
    statDefinitions: story.statDefinitions ?? [],
    itemDefinitions: (story.itemDefinitions ?? []).map((definition) => ({
      ...definition,
      stats: definition.stats ?? [],
    })),
    groups: story.groups ?? [],
    graphDecorations: story.graphDecorations ?? [],
    interactions: story.interactions.map((interaction) => ({
      ...interaction,
      characterIds: interaction.characterIds ?? [],
      statEffects: interaction.statEffects ?? [],
      itemEffects: interaction.itemEffects ?? [],
      conditionalTextBlocks: interaction.conditionalTextBlocks ?? [],
      triggers: interaction.triggers.map((trigger) => ({
        ...toCanonicalTrigger(trigger),
        inputInteractionIds: trigger.inputInteractionIds ?? [],
      })),
    })),
  });
}

function createDelta(
  beforeExists: boolean,
  before: JsonValue | undefined,
  afterExists: boolean,
  after: JsonValue | undefined,
): StoryChangeDelta | undefined {
  if (!beforeExists && !afterExists) {
    return undefined;
  }
  const objects = getObjectChange(beforeExists, before, afterExists, after);
  if (objects) {
    return createObjectDelta(...objects);
  }
  const entityArrays = getNonemptyEntityArrayChange(beforeExists, before, afterExists, after);
  if (entityArrays) {
    return createEntityArrayDelta(...entityArrays);
  }
  if (isSameExistingValue(beforeExists, before, afterExists, after)) {
    return undefined;
  }
  return createValueDelta(beforeExists, before, afterExists, after);
}

function getObjectChange(
  beforeExists: boolean,
  before: JsonValue | undefined,
  afterExists: boolean,
  after: JsonValue | undefined,
): [JsonObject, JsonObject] | undefined {
  if (!beforeExists || !afterExists || !isJsonObject(before) || !isJsonObject(after)) {
    return undefined;
  }
  return [before, after];
}

function createObjectDelta(before: JsonObject, after: JsonObject): StoryChangeDelta | undefined {
  const fields: Record<string, StoryChangeDelta> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const fieldDelta = createDelta(
      Object.hasOwn(before, key),
      before[key],
      Object.hasOwn(after, key),
      after[key],
    );
    if (fieldDelta) {
      fields[key] = fieldDelta;
    }
  }
  return Object.keys(fields).length > 0 ? { kind: 'object', fields } : undefined;
}

function getNonemptyEntityArrayChange(
  beforeExists: boolean,
  before: JsonValue | undefined,
  afterExists: boolean,
  after: JsonValue | undefined,
): [EntityJsonObject[], EntityJsonObject[]] | undefined {
  if (
    !beforeExists ||
    !afterExists ||
    !Array.isArray(before) ||
    !Array.isArray(after) ||
    !isEntityArray(before) ||
    !isEntityArray(after) ||
    before.length + after.length === 0
  ) {
    return undefined;
  }
  return [before, after];
}

function isSameExistingValue(
  beforeExists: boolean,
  before: JsonValue | undefined,
  afterExists: boolean,
  after: JsonValue | undefined,
): boolean {
  return (
    isExistingJsonValue(beforeExists, before) &&
    isExistingJsonValue(afterExists, after) &&
    jsonEquals(before, after)
  );
}

function createValueDelta(
  beforeExists: boolean,
  before: JsonValue | undefined,
  afterExists: boolean,
  after: JsonValue | undefined,
): ValueDelta {
  const hasBefore = isExistingJsonValue(beforeExists, before);
  const hasAfter = isExistingJsonValue(afterExists, after);
  return {
    kind: 'value',
    beforeExists,
    afterExists,
    ...(hasBefore ? { before: cloneJson(before) } : {}),
    ...(hasAfter ? { after: cloneJson(after) } : {}),
  };
}

function isExistingJsonValue(exists: boolean, value: JsonValue | undefined): value is JsonValue {
  return exists && value !== undefined;
}

function createEntityArrayDelta(
  before: EntityJsonObject[],
  after: EntityJsonObject[],
): EntityArrayDelta | undefined {
  const beforeById = new Map(before.map((value) => [value.id, value]));
  const afterById = new Map(after.map((value) => [value.id, value]));
  const movedIds = getMovedEntityIds(before, after, beforeById, afterById);
  const beforePlacements = entityPlacements(before);
  const afterPlacements = entityPlacements(after);
  const context = { beforeById, afterById, movedIds, beforePlacements, afterPlacements };
  const entries: Record<string, EntityDeltaEntry> = {};
  for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) {
    const entry = createEntityDeltaEntry(id, context);
    if (entry) {
      entries[id] = entry;
    }
  }
  return Object.keys(entries).length > 0 ? { kind: 'entities', entries } : undefined;
}

function getMovedEntityIds(
  before: EntityJsonObject[],
  after: EntityJsonObject[],
  beforeById: Map<string, EntityJsonObject>,
  afterById: Map<string, EntityJsonObject>,
): Set<string> {
  const commonIds = new Set([...beforeById.keys()].filter((id) => afterById.has(id)));
  const beforeCommon = before.map(({ id }) => id).filter((id) => commonIds.has(id));
  const afterCommon = after.map(({ id }) => id).filter((id) => commonIds.has(id));
  if (jsonEquals(beforeCommon, afterCommon)) {
    return new Set();
  }

  const beforeIndexes = new Map(beforeCommon.map((id, index) => [id, index]));
  const afterIndexes = new Map(afterCommon.map((id, index) => [id, index]));
  return new Set([...commonIds].filter((id) => beforeIndexes.get(id) !== afterIndexes.get(id)));
}

function createEntityDeltaEntry(
  id: string,
  context: {
    beforeById: Map<string, EntityJsonObject>;
    afterById: Map<string, EntityJsonObject>;
    movedIds: Set<string>;
    beforePlacements: Map<string, EntityPlacement>;
    afterPlacements: Map<string, EntityPlacement>;
  },
): EntityDeltaEntry | undefined {
  const previous = context.beforeById.get(id);
  const next = context.afterById.get(id);
  const delta = createDelta(previous !== undefined, previous, next !== undefined, next);
  const move = previous === undefined || next === undefined || context.movedIds.has(id);
  if (!delta && !move) {
    return undefined;
  }
  return {
    ...(delta ? { delta } : {}),
    ...(move ? { move: true } : {}),
    before: context.beforePlacements.get(id) ?? { index: -1 },
    after: context.afterPlacements.get(id) ?? { index: -1 },
  };
}

function entityPlacements(values: EntityJsonObject[]): Map<string, EntityPlacement> {
  return new Map(
    values.map((value, index) => [
      value.id,
      {
        index,
        ...(index > 0 ? { previousId: values[index - 1].id } : {}),
        ...(index < values.length - 1 ? { nextId: values[index + 1].id } : {}),
      },
    ]),
  );
}

type DeltaApplicationValue = { exists: true; value: JsonValue } | { exists: false };

interface DeltaApplicationContext {
  direction: 'forward' | 'backward';
  path: string;
  conflicts: StoryChangeConflict[];
}

interface EntityDeltaApplicationContext extends DeltaApplicationContext {
  entityId: string;
}

interface EntityDeltaApplicationState {
  values: EntityJsonObject[];
  indexesById: Map<string, number>;
  deletedIds: Set<string>;
}

function applyDelta(
  currentExists: boolean,
  current: JsonValue | undefined,
  delta: StoryChangeDelta,
  context: DeltaApplicationContext,
): DeltaApplicationValue {
  if (delta.kind === 'value') {
    return applyValueDelta(currentExists, current, delta, context);
  }
  if (!currentExists) {
    context.conflicts.push({ path: context.path });
    return { exists: false };
  }
  if (delta.kind === 'object') {
    return applyObjectDelta(current, delta, context);
  }
  return applyEntityArrayDelta(current, delta, context);
}

function applyValueDelta(
  currentExists: boolean,
  current: JsonValue | undefined,
  delta: ValueDelta,
  context: DeltaApplicationContext,
): DeltaApplicationValue {
  if (!matchesExpectedValue(currentExists, current, delta, context.direction)) {
    context.conflicts.push({ path: context.path });
    return currentExists && current !== undefined
      ? { exists: true, value: current }
      : { exists: false };
  }
  const replacementExists =
    context.direction === 'forward' ? delta.afterExists : delta.beforeExists;
  const replacement = context.direction === 'forward' ? delta.after : delta.before;
  if (replacementExists && replacement !== undefined) {
    return { exists: true, value: cloneJson(replacement) };
  }
  return { exists: false };
}

function matchesExpectedValue(
  currentExists: boolean,
  current: JsonValue | undefined,
  delta: ValueDelta,
  direction: 'forward' | 'backward',
): boolean {
  const expectedExists = direction === 'forward' ? delta.beforeExists : delta.afterExists;
  const expected = direction === 'forward' ? delta.before : delta.after;
  return currentExists === expectedExists && (!expectedExists || jsonEquals(current, expected));
}

function applyObjectDelta(
  current: JsonValue | undefined,
  delta: ObjectDelta,
  context: DeltaApplicationContext,
): DeltaApplicationValue {
  if (!isJsonObject(current)) {
    context.conflicts.push({ path: context.path });
    return current === undefined ? { exists: false } : { exists: true, value: current };
  }
  const value = { ...current };
  for (const [key, fieldDelta] of Object.entries(delta.fields)) {
    const field = applyDelta(Object.hasOwn(value, key), value[key], fieldDelta, {
      ...context,
      path: `${context.path}.${key}`,
    });
    if (field.exists) {
      value[key] = field.value;
    } else {
      delete value[key];
    }
  }
  return { exists: true, value };
}

function applyEntityArrayDelta(
  current: JsonValue | undefined,
  delta: EntityArrayDelta,
  context: DeltaApplicationContext,
): DeltaApplicationValue {
  if (!Array.isArray(current) || !isEntityArray(current)) {
    context.conflicts.push({ path: context.path });
    return current === undefined ? { exists: false } : { exists: true, value: current };
  }
  const state: EntityDeltaApplicationState = {
    values: [...current],
    indexesById: new Map(current.map((value, index) => [value.id, index])),
    deletedIds: new Set(),
  };
  applyEntityEntries(delta, context, state);
  if (state.deletedIds.size > 0) {
    state.values = state.values.filter((value) => !state.deletedIds.has(value.id));
  }
  if (context.conflicts.length === 0) {
    validateEntityPlacements(state.values, delta, context);
  }
  if (context.conflicts.length === 0) {
    applyEntityPlacements(state.values, delta, context.direction);
  }
  return { exists: true, value: state.values };
}

function applyEntityEntries(
  delta: EntityArrayDelta,
  context: DeltaApplicationContext,
  state: EntityDeltaApplicationState,
): void {
  for (const [id, entry] of Object.entries(delta.entries)) {
    if (entry.delta) {
      applyEntityEntry(id, entry, context, state);
    }
  }
}

function applyEntityEntry(
  id: string,
  entry: EntityDeltaEntry,
  context: DeltaApplicationContext,
  state: EntityDeltaApplicationState,
): void {
  if (!entry.delta) {
    return;
  }
  const index = state.indexesById.get(id) ?? -1;
  const entityPath = `${context.path}[id=${JSON.stringify(id)}]`;
  const entityContext = { ...context, entityId: id, path: entityPath };
  const applied = applyDelta(
    index >= 0,
    index >= 0 ? state.values[index] : undefined,
    entry.delta,
    entityContext,
  );
  if (index >= 0) {
    applyExistingEntity(index, applied, entityContext, state);
    return;
  }
  appendCreatedEntity(applied, entityContext, state);
}

function applyExistingEntity(
  index: number,
  applied: DeltaApplicationValue,
  context: EntityDeltaApplicationContext,
  state: EntityDeltaApplicationState,
): void {
  if (applied.exists && isEntityJsonObject(applied.value)) {
    state.values[index] = applied.value;
  } else if (applied.exists) {
    context.conflicts.push({ path: context.path });
  } else {
    state.deletedIds.add(context.entityId);
  }
}

function appendCreatedEntity(
  applied: DeltaApplicationValue,
  context: EntityDeltaApplicationContext,
  state: EntityDeltaApplicationState,
): void {
  if (!applied.exists) {
    return;
  }
  if (isEntityJsonObject(applied.value)) {
    const index = state.values.length;
    state.indexesById.set(context.entityId, index);
    state.values.push(applied.value);
  } else {
    context.conflicts.push({ path: context.path });
  }
}

function validateEntityPlacements(
  values: EntityJsonObject[],
  delta: EntityArrayDelta,
  context: DeltaApplicationContext,
): void {
  const indexesById = new Map(values.map((value, index) => [value.id, index]));
  for (const [id, entry] of Object.entries(delta.entries)) {
    if (hasEntityPlacementConflict(id, entry, indexesById, context.direction)) {
      context.conflicts.push({ path: `${context.path}[id=${JSON.stringify(id)}]` });
    }
  }
}

function hasEntityPlacementConflict(
  id: string,
  entry: EntityDeltaEntry,
  indexesById: Map<string, number>,
  direction: 'forward' | 'backward',
): boolean {
  if (!entry.move) {
    return false;
  }
  const expected = direction === 'forward' ? entry.before : entry.after;
  const replacement = direction === 'forward' ? entry.after : entry.before;
  if (expected.index < 0 || replacement.index < 0) {
    return false;
  }
  const index = indexesById.get(id) ?? -1;
  if (index < 0) {
    return false;
  }
  const previousIndex = getNeighborIndex(expected.previousId, indexesById);
  const nextIndex = getNeighborIndex(expected.nextId, indexesById);
  return hasNeighborOrderConflict(previousIndex, index, nextIndex);
}

function hasNeighborOrderConflict(
  previousIndex: number,
  index: number,
  nextIndex: number,
): boolean {
  return (previousIndex >= 0 && previousIndex > index) || (nextIndex >= 0 && nextIndex < index);
}

function getNeighborIndex(id: string | undefined, indexesById: Map<string, number>): number {
  return id ? (indexesById.get(id) ?? -1) : -1;
}

function applyEntityPlacements(
  values: EntityJsonObject[],
  delta: EntityArrayDelta,
  direction: 'forward' | 'backward',
): void {
  const placements = getEntityPlacementsToApply(values, delta, direction);
  const moving = removeMovedEntities(values, placements);
  insertMovedEntities(values, placements, moving);
}

function getEntityPlacementsToApply(
  values: EntityJsonObject[],
  delta: EntityArrayDelta,
  direction: 'forward' | 'backward',
): Array<{ id: string; placement: EntityPlacement }> {
  return Object.entries(delta.entries)
    .filter(([, entry]) => entry.move)
    .map(([id, entry]) => ({ id, placement: direction === 'forward' ? entry.after : entry.before }))
    .filter(({ id, placement }) => placement.index >= 0 && values.some((value) => value.id === id))
    .sort((left, right) => left.placement.index - right.placement.index);
}

function removeMovedEntities(
  values: EntityJsonObject[],
  placements: Array<{ id: string; placement: EntityPlacement }>,
): Map<string, EntityJsonObject> {
  const moving = new Map<string, EntityJsonObject>();
  for (const { id } of placements) {
    const index = values.findIndex((value) => value.id === id);
    if (index >= 0) {
      moving.set(id, values.splice(index, 1)[0]);
    }
  }
  return moving;
}

function insertMovedEntities(
  values: EntityJsonObject[],
  placements: Array<{ id: string; placement: EntityPlacement }>,
  moving: Map<string, EntityJsonObject>,
): void {
  for (const { id, placement } of placements) {
    const value = moving.get(id);
    if (!value) {
      continue;
    }
    const index = resolveEntityPlacementIndex(values, placement);
    values.splice(index, 0, value);
  }
}

function resolveEntityPlacementIndex(
  values: EntityJsonObject[],
  placement: EntityPlacement,
): number {
  const previousIndex = placement.previousId
    ? values.findIndex((candidate) => candidate.id === placement.previousId)
    : -1;
  if (previousIndex >= 0) {
    return previousIndex + 1;
  }
  const nextIndex = placement.nextId
    ? values.findIndex((candidate) => candidate.id === placement.nextId)
    : -1;
  if (nextIndex >= 0) {
    return nextIndex;
  }
  return Math.min(placement.index, values.length);
}

function isEntityArray(value: JsonValue[]): value is EntityJsonObject[] {
  const ids = new Set<string>();
  return value.every((item) => {
    if (!isEntityJsonObject(item) || ids.has(item.id)) {
      return false;
    }
    ids.add(item.id);
    return true;
  });
}

function isEntityJsonObject(value: JsonValue): value is EntityJsonObject {
  return isJsonObject(value) && typeof value.id === 'string';
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (Array.isArray(value)) {
    return value.map(toJsonValue);
  }
  if (typeof value === 'object') {
    return toJsonObject(value);
  }
  throw new TypeError('Story history only supports JSON-compatible authored values.');
}

function toJsonObject(value: object): JsonObject {
  const result: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      result[key] = toJsonValue(entry);
    }
  }
  return result;
}

function jsonEquals(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return jsonArraysEqual(left, right);
  }
  if (isJsonObject(left) || isJsonObject(right)) {
    return jsonObjectsEqual(left, right);
  }
  return false;
}

function jsonArraysEqual(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => jsonEquals(value, right[index]))
  );
}

function jsonObjectsEqual(left: JsonValue | undefined, right: JsonValue | undefined): boolean {
  if (!isJsonObject(left) || !isJsonObject(right)) {
    return false;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => Object.hasOwn(right, key) && jsonEquals(left[key], right[key]))
  );
}

function cloneJson<T extends JsonValue | undefined>(value: T): T {
  return structuredClone(value);
}
