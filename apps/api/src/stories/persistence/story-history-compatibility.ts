import type { StoryChangeDelta } from '@paralleax/shared';

type AbsentValueRule = (value: unknown) => boolean;

const isNull: AbsentValueRule = (value) => value === null;
const isEmptyString: AbsentValueRule = (value) => value === '';
const isFalse: AbsentValueRule = (value) => value === false;

/**
 * Values the Story projections omit when they read an entity back, by Story
 * collection and entity field. History events recorded before the repository
 * recorded deltas against that read-back form may still hold them.
 */
const legacyAbsentValues: Record<string, Record<string, AbsentValueRule>> = {
  interactions: { locationId: isNull },
  locations: { category: isEmptyString, imageUrl: isEmptyString },
  characters: { category: isEmptyString, imageUrl: isEmptyString, isPlayable: isFalse },
  itemDefinitions: { category: isEmptyString, imageUrl: isEmptyString },
};

/**
 * Undo and redo compare a delta with the current Story exactly. Events recorded
 * before deltas were taken from the read-back Story can hold values that the
 * projections omit (for example `locationId: null` or `imageUrl: ''`); those
 * values are read as absent fields so the events stay replayable.
 *
 * Only the listed values are touched; every other value, and every event
 * recorded since, is returned unchanged. Persisted events are never rewritten.
 */
export function normalizeLegacyStoryHistoryDelta(changes: StoryChangeDelta): StoryChangeDelta {
  if (changes.kind !== 'object' || !hasLegacyCollection(changes.fields)) {
    return changes;
  }
  const normalized = structuredClone(changes);
  for (const [collection, rules] of Object.entries(legacyAbsentValues)) {
    for (const delta of entityDeltas(normalized.fields, collection)) {
      normalizeEntityDelta(delta, rules);
    }
  }
  return normalized;
}

function hasLegacyCollection(fields: Record<string, StoryChangeDelta>): boolean {
  return Object.keys(legacyAbsentValues).some(
    (collection) => entityDeltas(fields, collection).length > 0,
  );
}

function entityDeltas(
  fields: Record<string, StoryChangeDelta>,
  collection: string,
): StoryChangeDelta[] {
  // Field records are sparse: a delta only lists the Story fields that changed.
  if (!Object.hasOwn(fields, collection)) {
    return [];
  }
  const entities = fields[collection];
  if (entities.kind !== 'entities') {
    return [];
  }
  return Object.values(entities.entries).flatMap(({ delta }) =>
    delta === undefined ? [] : [delta],
  );
}

function normalizeEntityDelta(delta: StoryChangeDelta, rules: Record<string, AbsentValueRule>) {
  if (delta.kind === 'value') {
    // A created or deleted entity stores the whole entity as one value.
    removeAbsentValues(delta.before, rules);
    removeAbsentValues(delta.after, rules);
    return;
  }
  if (delta.kind !== 'object') {
    return;
  }
  for (const [field, isAbsent] of Object.entries(rules)) {
    if (Object.hasOwn(delta.fields, field)) {
      normalizeFieldDelta(delta.fields[field], isAbsent);
    }
  }
}

function normalizeFieldDelta(delta: StoryChangeDelta, isAbsent: AbsentValueRule) {
  if (delta.kind !== 'value') {
    return;
  }
  if (delta.beforeExists && isAbsent(delta.before)) {
    delta.beforeExists = false;
    delete delta.before;
  }
  if (delta.afterExists && isAbsent(delta.after)) {
    delta.afterExists = false;
    delete delta.after;
  }
}

function removeAbsentValues(entity: unknown, rules: Record<string, AbsentValueRule>) {
  if (!isRecord(entity)) {
    return;
  }
  for (const [field, isAbsent] of Object.entries(rules)) {
    if (Object.hasOwn(entity, field) && isAbsent(entity[field])) {
      delete entity[field];
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
