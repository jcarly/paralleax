import type { Character, Interaction, Location, Story, Trigger } from '../model/index.js';
import type { StoryChangeDelta } from '../history/story-history.js';
import { toCanonicalTrigger } from '../triggers/model.js';
import {
  fieldSummary,
  refOf,
  wholeEntityFields,
  type StoryChangeFieldSummary,
} from './summary-fields.js';

export type StoryChangeKind = 'added' | 'updated' | 'removed';

/** A Character or a Location added or updated by the batch. */
export interface StoryChangeContextEntitySummary {
  change: StoryChangeKind;
  id: string;
  ref?: string;
  name: string;
  fields: StoryChangeFieldSummary[];
}

export interface StoryChangeInteractionSummary {
  change: StoryChangeKind;
  id: string;
  ref?: string;
  title: string;
  fields: StoryChangeFieldSummary[];
}

export interface StoryChangeTriggerSummary {
  change: StoryChangeKind;
  id: string;
  ref?: string;
  /** Output Interaction that owns the Trigger. */
  interactionId: string;
  inputInteractionIds: string[];
  conditionCount: number;
  fields: StoryChangeFieldSummary[];
}

export interface StoryChangeConnectionSummary {
  change: 'added' | 'removed';
  triggerId: string;
  sourceInteractionId: string;
  targetInteractionId: string;
}

/** A readable projection of the history delta of a batch (ADR-050). */
export interface StoryChangeSummary {
  counts: {
    interactionsAdded: number;
    interactionsUpdated: number;
    triggersAdded: number;
    triggersUpdated: number;
    charactersAdded: number;
    charactersUpdated: number;
    locationsAdded: number;
    locationsUpdated: number;
    connectionsAdded: number;
    connectionsRemoved: number;
  };
  /**
   * True in a preview, where the IDs of created entities are provisional and
   * only their `ref` is stable; false once committed, with final IDs.
   */
  provisionalIds: boolean;
  interactions: StoryChangeInteractionSummary[];
  triggers: StoryChangeTriggerSummary[];
  characters: StoryChangeContextEntitySummary[];
  locations: StoryChangeContextEntitySummary[];
  connections: StoryChangeConnectionSummary[];
  /** Authored Story fields outside interactions changed by the delta. */
  otherChangedFields: string[];
}

type EntityEntries = Extract<StoryChangeDelta, { kind: 'entities' }>['entries'];
type EntityEntry = EntityEntries[string];

interface SummaryContext {
  summary: StoryChangeSummary;
  refsById: ReadonlyMap<string, string>;
}

/**
 * Projects the reversible history delta of `before → after` into added and
 * updated entities, their changed fields with old and new values, and the
 * Trigger connections that appeared or disappeared. The delta stays the source
 * of truth; this summary only makes it reviewable.
 */
export interface StoryChangeSummaryOptions {
  /** Temporary reference of each entity the batch creates, by ID. */
  refsById?: ReadonlyMap<string, string>;
  /** True for a preview, where the IDs of created entities are provisional. */
  provisionalIds?: boolean;
}

export function summarizeStoryChanges(
  before: Story,
  after: Story,
  delta: StoryChangeDelta | undefined,
  options: StoryChangeSummaryOptions = {},
): StoryChangeSummary {
  const summary = emptySummary(diffConnections(before, after), options.provisionalIds ?? false);
  const context = { summary, refsById: options.refsById ?? new Map() };
  for (const [field, fieldDelta] of Object.entries(delta?.kind === 'object' ? delta.fields : {})) {
    if (!summarizeField(context, field, fieldDelta, { before, after })) {
      summary.otherChangedFields.push(field);
    }
  }
  countChanges(summary);
  return summary;
}

function emptySummary(
  connections: StoryChangeConnectionSummary[],
  provisionalIds: boolean,
): StoryChangeSummary {
  return {
    counts: {
      interactionsAdded: 0,
      interactionsUpdated: 0,
      triggersAdded: 0,
      triggersUpdated: 0,
      charactersAdded: 0,
      charactersUpdated: 0,
      locationsAdded: 0,
      locationsUpdated: 0,
      connectionsAdded: 0,
      connectionsRemoved: 0,
    },
    provisionalIds,
    interactions: [],
    triggers: [],
    characters: [],
    locations: [],
    connections,
    otherChangedFields: [],
  };
}

/** Summarizes an entity list of the Story; false for a field the summary omits. */
function summarizeField(
  context: SummaryContext,
  field: string,
  fieldDelta: StoryChangeDelta,
  stories: { before: Story; after: Story },
): boolean {
  if (fieldDelta.kind !== 'entities') {
    return false;
  }
  const { before, after } = stories;
  switch (field) {
    case 'interactions':
      summarizeInteractions(context, before, after, fieldDelta.entries);
      return true;
    case 'characters':
      summarizeContextEntities(context, context.summary.characters, {
        previous: before.characters ?? [],
        next: after.characters ?? [],
        entries: fieldDelta.entries,
      });
      return true;
    case 'locations':
      summarizeContextEntities(context, context.summary.locations, {
        previous: before.locations ?? [],
        next: after.locations ?? [],
        entries: fieldDelta.entries,
      });
      return true;
    default:
      return false;
  }
}

function countChanges(summary: StoryChangeSummary): void {
  const { counts } = summary;
  counts.interactionsAdded = summary.interactions.filter(isAdded).length;
  counts.interactionsUpdated = summary.interactions.filter(isUpdated).length;
  counts.triggersAdded = summary.triggers.filter(isAdded).length;
  counts.triggersUpdated = summary.triggers.filter(isUpdated).length;
  counts.charactersAdded = summary.characters.filter(isAdded).length;
  counts.charactersUpdated = summary.characters.filter(isUpdated).length;
  counts.locationsAdded = summary.locations.filter(isAdded).length;
  counts.locationsUpdated = summary.locations.filter(isUpdated).length;
  counts.connectionsAdded = summary.connections.filter(isAdded).length;
  counts.connectionsRemoved = summary.connections.length - counts.connectionsAdded;
}

function isAdded({ change }: { change: StoryChangeKind }): boolean {
  return change === 'added';
}

function isUpdated({ change }: { change: StoryChangeKind }): boolean {
  return change === 'updated';
}

function summarizeInteractions(
  context: SummaryContext,
  before: Story,
  after: Story,
  entries: EntityEntries,
): void {
  const beforeById = new Map(before.interactions.map((item) => [item.id, item]));
  const afterById = new Map(after.interactions.map((item) => [item.id, item]));
  for (const [id, entry] of Object.entries(entries)) {
    summarizeInteraction(context, entry, beforeById.get(id), afterById.get(id));
  }
}

function summarizeInteraction(
  context: SummaryContext,
  entry: EntityEntry,
  previous: Interaction | undefined,
  next: Interaction | undefined,
): void {
  const change = entityChange(entry);
  const current = next ?? previous;
  if (!change || !current) {
    return;
  }
  const changedFields: Record<string, StoryChangeDelta> =
    entry.delta?.kind === 'object' ? entry.delta.fields : {};
  summarizeOwnedTriggers(context, change, { id: current.id, previous, next }, changedFields);
  const fields =
    change === 'updated'
      ? Object.keys(changedFields)
          .filter((field) => field !== 'triggers')
          .map((field) => fieldSummary(context, field, previous, next))
      : wholeEntityFields(context, change, current, interactionSummaryExclusions);
  if (change === 'updated' && fields.length === 0) {
    return;
  }
  context.summary.interactions.push({
    change,
    id: current.id,
    ...refOf(context.refsById, current.id),
    title: current.title,
    fields,
  });
}

/** Characters and Locations share one summary: the same authored shape. */
function summarizeContextEntities(
  context: SummaryContext,
  into: StoryChangeContextEntitySummary[],
  source: {
    previous: readonly (Character | Location)[];
    next: readonly (Character | Location)[];
    entries: EntityEntries;
  },
): void {
  const previousById = new Map(source.previous.map((item) => [item.id, item]));
  const nextById = new Map(source.next.map((item) => [item.id, item]));
  for (const [id, entry] of Object.entries(source.entries)) {
    const previous = previousById.get(id);
    const next = nextById.get(id);
    const change = entityChange(entry);
    const current = next ?? previous;
    if (!change || !current) {
      continue;
    }
    const changedFields = entry.delta?.kind === 'object' ? Object.keys(entry.delta.fields) : [];
    const fields =
      change === 'updated'
        ? changedFields.map((field) => fieldSummary(context, field, previous, next))
        : wholeEntityFields(context, change, current, contextEntitySummaryExclusions);
    if (change === 'updated' && fields.length === 0) {
      continue;
    }
    into.push({ change, id, ...refOf(context.refsById, id), name: current.name, fields });
  }
}

const contextEntitySummaryExclusions = new Set(['id', 'name']);

interface TriggerOwner {
  id: string;
  previous: Interaction | undefined;
  next: Interaction | undefined;
}

/** Every Trigger of an added or removed Interaction, or the changed ones. */
function summarizeOwnedTriggers(
  context: SummaryContext,
  change: StoryChangeKind,
  owner: TriggerOwner,
  changedFields: Record<string, StoryChangeDelta>,
): void {
  if (change !== 'updated') {
    for (const trigger of (owner.next ?? owner.previous)?.triggers ?? []) {
      const fields = wholeEntityFields(
        context,
        change,
        toCanonicalTrigger(trigger),
        triggerSummaryExclusions,
      );
      context.summary.triggers.push(triggerSummary(context, { change, owner, trigger, fields }));
    }
    return;
  }
  const triggers = Object.hasOwn(changedFields, 'triggers') ? changedFields.triggers : undefined;
  if (triggers?.kind === 'entities') {
    summarizeTriggers(context, owner, triggers.entries);
  }
}

function summarizeTriggers(
  context: SummaryContext,
  owner: TriggerOwner,
  entries: EntityEntries,
): void {
  for (const [id, entry] of Object.entries(entries)) {
    const change = entityChange(entry);
    const before = owner.previous?.triggers.find((trigger) => trigger.id === id);
    const after = owner.next?.triggers.find((trigger) => trigger.id === id);
    const trigger = after ?? before;
    if (!change || !trigger) {
      continue;
    }
    const fields = changedTriggerFields(context, change, entry, { before, after, trigger });
    context.summary.triggers.push(triggerSummary(context, { change, owner, trigger, fields }));
  }
}

/** Changed fields of an updated Trigger, or every field of an added or removed one. */
function changedTriggerFields(
  context: SummaryContext,
  change: StoryChangeKind,
  entry: EntityEntry,
  triggers: { before: Trigger | undefined; after: Trigger | undefined; trigger: Trigger },
): StoryChangeFieldSummary[] {
  if (change !== 'updated') {
    return wholeEntityFields(
      context,
      change,
      toCanonicalTrigger(triggers.trigger),
      triggerSummaryExclusions,
    );
  }
  const previous = triggers.before === undefined ? undefined : toCanonicalTrigger(triggers.before);
  const next = triggers.after === undefined ? undefined : toCanonicalTrigger(triggers.after);
  const changed = entry.delta?.kind === 'object' ? Object.keys(entry.delta.fields) : [];
  return changed.map((field) => fieldSummary(context, field, previous, next));
}

function triggerSummary(
  context: SummaryContext,
  item: {
    change: StoryChangeKind;
    owner: TriggerOwner;
    trigger: Trigger;
    fields: StoryChangeFieldSummary[];
  },
): StoryChangeTriggerSummary {
  const { change, owner, trigger, fields } = item;
  const canonical = toCanonicalTrigger(trigger);
  return {
    change,
    id: trigger.id,
    ...refOf(context.refsById, trigger.id),
    interactionId: owner.id,
    inputInteractionIds: [...trigger.inputInteractionIds],
    conditionCount: (canonical.conditionGroups ?? []).reduce(
      (count, group) => count + group.conditions.length,
      0,
    ),
    fields,
  };
}

/** Shown on their own in each summary item, or internal identities. */
const interactionSummaryExclusions = new Set(['id', 'title', 'triggers']);
const triggerSummaryExclusions = new Set([
  'id',
  'probabilityKey',
  'inputInteractionIds',
  'conditions',
]);

function entityChange(entry: EntityEntry): StoryChangeKind | undefined {
  const delta = entry.delta;
  if (delta?.kind === 'value') {
    if (!delta.beforeExists) {
      return 'added';
    }
    return delta.afterExists ? 'updated' : 'removed';
  }
  // An entry with only `move` changes list order, which the summary omits.
  return delta === undefined ? undefined : 'updated';
}

function connectionKeys(story: Story): Map<string, StoryChangeConnectionSummary> {
  const connections = new Map<string, StoryChangeConnectionSummary>();
  for (const interaction of story.interactions) {
    for (const trigger of interaction.triggers) {
      for (const sourceInteractionId of trigger.inputInteractionIds) {
        connections.set(`${trigger.id}\u0000${sourceInteractionId}\u0000${interaction.id}`, {
          change: 'added',
          triggerId: trigger.id,
          sourceInteractionId,
          targetInteractionId: interaction.id,
        });
      }
    }
  }
  return connections;
}

function diffConnections(before: Story, after: Story): StoryChangeConnectionSummary[] {
  const previous = connectionKeys(before);
  const next = connectionKeys(after);
  return [
    ...[...next].filter(([key]) => !previous.has(key)).map(([, connection]) => connection),
    ...[...previous]
      .filter(([key]) => !next.has(key))
      .map(([, connection]) => ({ ...connection, change: 'removed' as const })),
  ];
}
