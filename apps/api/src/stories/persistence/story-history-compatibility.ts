import type { StoryChangeDelta } from '@paralleax/shared';

/**
 * History events recorded before Interactions without a location were read back
 * without `locationId` store that absence as `locationId: null`. Undo and redo
 * compare a delta with the current Story exactly, so those legacy values must be
 * read as an absent field, matching how Interactions are now projected.
 *
 * The normalization only touches Interaction `locationId` values that are null;
 * every other value, and every event recorded since, is returned unchanged.
 */
export function normalizeLegacyStoryHistoryDelta(changes: StoryChangeDelta): StoryChangeDelta {
  if (changes.kind !== 'object' || !hasInteractionEntities(changes.fields)) {
    return changes;
  }
  const normalized = structuredClone(changes);
  const interactions = normalized.fields.interactions;
  if (interactions.kind === 'entities') {
    for (const entry of Object.values(interactions.entries)) {
      if (entry.delta !== undefined) {
        normalizeInteractionDelta(entry.delta);
      }
    }
  }
  return normalized;
}

function hasInteractionEntities(fields: Record<string, StoryChangeDelta>): boolean {
  // Field records are sparse: a delta only lists the Story fields that changed.
  return Object.hasOwn(fields, 'interactions') && fields.interactions.kind === 'entities';
}

function normalizeInteractionDelta(delta: StoryChangeDelta) {
  if (delta.kind === 'value') {
    // A created or deleted Interaction stores the whole entity as one value.
    removeNullLocation(delta.before);
    removeNullLocation(delta.after);
    return;
  }
  if (delta.kind !== 'object' || !Object.hasOwn(delta.fields, 'locationId')) {
    return;
  }
  const location = delta.fields.locationId;
  if (location.kind !== 'value') {
    return;
  }
  if (location.beforeExists && location.before === null) {
    location.beforeExists = false;
    delete location.before;
  }
  if (location.afterExists && location.after === null) {
    location.afterExists = false;
    delete location.after;
  }
}

function removeNullLocation(entity: unknown) {
  if (typeof entity === 'object' && entity !== null && !Array.isArray(entity)) {
    if ('locationId' in entity && entity.locationId === null) {
      delete entity.locationId;
    }
  }
}
