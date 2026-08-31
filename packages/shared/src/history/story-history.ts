import type { Story } from '../model/stories.js';
import { diffStoryGraphPositions, type StoryGraphPositionPatch } from '../graph/positions.js';
import { toCanonicalTrigger } from '../triggers/model.js';

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

export interface StoryHistoryActor {
  id: string;
  email?: string;
}

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
  if (delta.kind !== 'object' || Object.keys(delta.fields).length !== 1) return false;
  const interactions = delta.fields.interactions;
  if (!interactions || interactions.kind !== 'entities') return false;
  const entries = Object.values(interactions.entries);
  return entries.length > 0 && entries.every(isInteractionGraphPositionEntry);
}

function isInteractionGraphPositionEntry(entry: EntityDeltaEntry): boolean {
  if (entry.move || !entry.delta || entry.delta.kind !== 'object') return false;
  const fields = Object.entries(entry.delta.fields);
  return (
    fields.length > 0 &&
    fields.every(([key, delta]) => {
      if (key === 'position') return isPositionDelta(delta);
      if (key !== 'triggers' || delta.kind !== 'entities') return false;
      const triggerEntries = Object.values(delta.entries);
      return triggerEntries.length > 0 && triggerEntries.every(isTriggerGraphPositionEntry);
    })
  );
}

function isTriggerGraphPositionEntry(entry: EntityDeltaEntry): boolean {
  if (entry.move || !entry.delta || entry.delta.kind !== 'object') return false;
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
  if (delta.kind !== 'object') return false;
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
  const result = applyDelta(
    true,
    authoredStoryProjection(current),
    delta,
    direction,
    '$',
    conflicts,
  );
  if (conflicts.length > 0 || !result.exists || !isJsonObject(result.value)) {
    return {
      applied: false,
      conflicts: conflicts.length > 0 ? conflicts : [{ path: '$' }],
    };
  }

  const story = structuredClone(current) as Story & Record<string, unknown>;
  for (const key of authoredStoryKeys) delete story[key];
  Object.assign(story, result.value);
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
  if (!beforeExists && !afterExists) return undefined;

  if (beforeExists && afterExists && isJsonObject(before) && isJsonObject(after)) {
    const fields: Record<string, StoryChangeDelta> = {};
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const fieldDelta = createDelta(
        Object.hasOwn(before, key),
        before[key],
        Object.hasOwn(after, key),
        after[key],
      );
      if (fieldDelta) fields[key] = fieldDelta;
    }
    return Object.keys(fields).length > 0 ? { kind: 'object', fields } : undefined;
  }

  if (
    beforeExists &&
    afterExists &&
    Array.isArray(before) &&
    Array.isArray(after) &&
    isEntityArray(before) &&
    isEntityArray(after) &&
    before.length + after.length > 0
  ) {
    return createEntityArrayDelta(before, after);
  }

  if (beforeExists && afterExists && jsonEquals(before as JsonValue, after as JsonValue)) {
    return undefined;
  }

  return {
    kind: 'value',
    beforeExists,
    afterExists,
    ...(beforeExists ? { before: cloneJson(before as JsonValue) } : {}),
    ...(afterExists ? { after: cloneJson(after as JsonValue) } : {}),
  };
}

function createEntityArrayDelta(
  before: Array<{ [key: string]: JsonValue }>,
  after: Array<{ [key: string]: JsonValue }>,
): EntityArrayDelta | undefined {
  const beforeById = new Map(before.map((value) => [value.id as string, value]));
  const afterById = new Map(after.map((value) => [value.id as string, value]));
  const commonIds = new Set([...beforeById.keys()].filter((id) => afterById.has(id)));
  const beforeCommon = before.map(({ id }) => id as string).filter((id) => commonIds.has(id));
  const afterCommon = after.map(({ id }) => id as string).filter((id) => commonIds.has(id));
  const movedIds = new Set<string>();
  if (!jsonEquals(beforeCommon, afterCommon)) {
    const beforeIndexes = new Map(beforeCommon.map((id, index) => [id, index]));
    const afterIndexes = new Map(afterCommon.map((id, index) => [id, index]));
    for (const id of commonIds) {
      if (beforeIndexes.get(id) !== afterIndexes.get(id)) movedIds.add(id);
    }
  }

  const beforePlacements = entityPlacements(before);
  const afterPlacements = entityPlacements(after);
  const entries: Record<string, EntityDeltaEntry> = {};
  for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) {
    const previous = beforeById.get(id);
    const next = afterById.get(id);
    const delta = createDelta(previous !== undefined, previous, next !== undefined, next);
    const move = previous === undefined || next === undefined || movedIds.has(id);
    if (!delta && !move) continue;
    entries[id] = {
      ...(delta ? { delta } : {}),
      ...(move ? { move: true } : {}),
      before: beforePlacements.get(id) ?? { index: -1 },
      after: afterPlacements.get(id) ?? { index: -1 },
    };
  }
  return Object.keys(entries).length > 0 ? { kind: 'entities', entries } : undefined;
}

function entityPlacements(
  values: Array<{ [key: string]: JsonValue }>,
): Map<string, EntityPlacement> {
  return new Map(
    values.map((value, index) => [
      value.id as string,
      {
        index,
        ...(index > 0 ? { previousId: values[index - 1].id as string } : {}),
        ...(index < values.length - 1 ? { nextId: values[index + 1].id as string } : {}),
      },
    ]),
  );
}

interface DeltaApplicationValue {
  exists: boolean;
  value?: JsonValue;
}

function applyDelta(
  currentExists: boolean,
  current: JsonValue | undefined,
  delta: StoryChangeDelta,
  direction: 'forward' | 'backward',
  path: string,
  conflicts: StoryChangeConflict[],
): DeltaApplicationValue {
  if (delta.kind === 'value') {
    const expectedExists = direction === 'forward' ? delta.beforeExists : delta.afterExists;
    const expected = direction === 'forward' ? delta.before : delta.after;
    if (
      currentExists !== expectedExists ||
      (expectedExists && !jsonEquals(current as JsonValue, expected as JsonValue))
    ) {
      conflicts.push({ path });
      return { exists: currentExists, ...(currentExists ? { value: current } : {}) };
    }
    const replacementExists = direction === 'forward' ? delta.afterExists : delta.beforeExists;
    const replacement = direction === 'forward' ? delta.after : delta.before;
    return replacementExists
      ? { exists: true, value: cloneJson(replacement as JsonValue) }
      : { exists: false };
  }

  if (!currentExists) {
    conflicts.push({ path });
    return { exists: false };
  }

  if (delta.kind === 'object') {
    if (!isJsonObject(current)) {
      conflicts.push({ path });
      return { exists: true, value: current };
    }
    const value = { ...current };
    for (const [key, fieldDelta] of Object.entries(delta.fields)) {
      const field = applyDelta(
        Object.hasOwn(value, key),
        value[key],
        fieldDelta,
        direction,
        `${path}.${key}`,
        conflicts,
      );
      if (field.exists) value[key] = field.value as JsonValue;
      else delete value[key];
    }
    return { exists: true, value };
  }

  if (!Array.isArray(current) || !isEntityArray(current)) {
    conflicts.push({ path });
    return { exists: true, value: current };
  }
  let values: Array<{ [key: string]: JsonValue }> = [...current];
  const indexesById = new Map(values.map((value, index) => [value.id as string, index]));
  const deletedIds = new Set<string>();
  for (const [id, entry] of Object.entries(delta.entries)) {
    if (!entry.delta) continue;
    const index = indexesById.get(id) ?? -1;
    const applied = applyDelta(
      index >= 0,
      index >= 0 ? values[index] : undefined,
      entry.delta,
      direction,
      `${path}[id=${JSON.stringify(id)}]`,
      conflicts,
    );
    if (index >= 0) {
      if (applied.exists) values[index] = applied.value as { [key: string]: JsonValue };
      else deletedIds.add(id);
    } else if (applied.exists) {
      indexesById.set(id, values.length);
      values.push(applied.value as { [key: string]: JsonValue });
    }
  }
  if (deletedIds.size > 0) {
    values = values.filter((value) => !deletedIds.has(value.id as string));
  }

  if (conflicts.length === 0) {
    validateEntityPlacements(values, delta, direction, path, conflicts);
  }
  if (conflicts.length === 0) applyEntityPlacements(values, delta, direction);
  return { exists: true, value: values };
}

function validateEntityPlacements(
  values: Array<{ [key: string]: JsonValue }>,
  delta: EntityArrayDelta,
  direction: 'forward' | 'backward',
  path: string,
  conflicts: StoryChangeConflict[],
) {
  const indexesById = new Map(values.map((value, index) => [value.id as string, index]));
  for (const [id, entry] of Object.entries(delta.entries)) {
    if (!entry.move) continue;
    const expected = direction === 'forward' ? entry.before : entry.after;
    const replacement = direction === 'forward' ? entry.after : entry.before;
    if (expected.index < 0 || replacement.index < 0) continue;
    const index = indexesById.get(id) ?? -1;
    if (index < 0) continue;
    const previousIndex = expected.previousId ? (indexesById.get(expected.previousId) ?? -1) : -1;
    const nextIndex = expected.nextId ? (indexesById.get(expected.nextId) ?? -1) : -1;
    if ((previousIndex >= 0 && previousIndex > index) || (nextIndex >= 0 && nextIndex < index)) {
      conflicts.push({ path: `${path}[id=${JSON.stringify(id)}]` });
    }
  }
}

function applyEntityPlacements(
  values: Array<{ [key: string]: JsonValue }>,
  delta: EntityArrayDelta,
  direction: 'forward' | 'backward',
) {
  const placements = Object.entries(delta.entries)
    .filter(([, entry]) => entry.move)
    .map(([id, entry]) => ({ id, placement: direction === 'forward' ? entry.after : entry.before }))
    .filter(({ id, placement }) => placement.index >= 0 && values.some((value) => value.id === id))
    .sort((left, right) => left.placement.index - right.placement.index);

  const moving = new Map<string, { [key: string]: JsonValue }>();
  for (const { id } of placements) {
    const index = values.findIndex((value) => value.id === id);
    if (index >= 0) moving.set(id, values.splice(index, 1)[0]);
  }
  for (const { id, placement } of placements) {
    const value = moving.get(id);
    if (!value) continue;
    const previousIndex = placement.previousId
      ? values.findIndex((candidate) => candidate.id === placement.previousId)
      : -1;
    const nextIndex = placement.nextId
      ? values.findIndex((candidate) => candidate.id === placement.nextId)
      : -1;
    const index =
      previousIndex >= 0
        ? previousIndex + 1
        : nextIndex >= 0
          ? nextIndex
          : Math.min(placement.index, values.length);
    values.splice(index, 0, value);
  }
}

function isEntityArray(
  value: JsonValue[],
): value is Array<{ [key: string]: JsonValue } & { id: string }> {
  const ids = new Set<string>();
  return value.every((item) => {
    if (!isJsonObject(item) || typeof item.id !== 'string' || ids.has(item.id)) return false;
    ids.add(item.id);
    return true;
  });
}

function isJsonObject(value: unknown): value is { [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(toJsonValue);
  if (typeof value === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry !== undefined) result[key] = toJsonValue(entry);
    }
    return result;
  }
  throw new TypeError('Story history only supports JSON-compatible authored values.');
}

function jsonEquals(left: JsonValue, right: JsonValue): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => jsonEquals(value, right[index]))
    );
  }
  if (isJsonObject(left) || isJsonObject(right)) {
    if (!isJsonObject(left) || !isJsonObject(right)) return false;
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every((key) => Object.hasOwn(right, key) && jsonEquals(left[key], right[key]))
    );
  }
  return false;
}

function cloneJson<T extends JsonValue>(value: T): T {
  return structuredClone(value);
}
