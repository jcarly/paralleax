import type { Interaction, Story, Trigger } from '../model/index.js';
import type { StoryChangeDelta } from '../history/story-history.js';
import { toCanonicalTrigger } from '../triggers/model.js';
import { STORY_CHANGE_BATCH_LIMITS } from './contract.js';

export type StoryChangeKind = 'added' | 'updated' | 'removed';

export interface StoryChangeFieldSummary {
  field: string;
  before?: unknown;
  after?: unknown;
  /** True when a value was shortened to keep the summary bounded. */
  truncated?: boolean;
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
    connectionsAdded: number;
    connectionsRemoved: number;
  };
  interactions: StoryChangeInteractionSummary[];
  triggers: StoryChangeTriggerSummary[];
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
export function summarizeStoryChanges(
  before: Story,
  after: Story,
  delta: StoryChangeDelta | undefined,
  refsById: ReadonlyMap<string, string> = new Map(),
): StoryChangeSummary {
  const summary: StoryChangeSummary = {
    counts: {
      interactionsAdded: 0,
      interactionsUpdated: 0,
      triggersAdded: 0,
      triggersUpdated: 0,
      connectionsAdded: 0,
      connectionsRemoved: 0,
    },
    interactions: [],
    triggers: [],
    connections: diffConnections(before, after),
    otherChangedFields: [],
  };
  const context = { summary, refsById };
  for (const [field, fieldDelta] of Object.entries(delta?.kind === 'object' ? delta.fields : {})) {
    if (field === 'interactions' && fieldDelta.kind === 'entities') {
      summarizeInteractions(context, before, after, fieldDelta.entries);
    } else {
      summary.otherChangedFields.push(field);
    }
  }
  countChanges(summary);
  return summary;
}

function countChanges(summary: StoryChangeSummary): void {
  const { counts } = summary;
  counts.interactionsAdded = summary.interactions.filter(isAdded).length;
  counts.interactionsUpdated = summary.interactions.filter(isUpdated).length;
  counts.triggersAdded = summary.triggers.filter(isAdded).length;
  counts.triggersUpdated = summary.triggers.filter(isUpdated).length;
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
          .map((field) => fieldSummary(field, previous, next))
      : wholeEntityFields(change, current, interactionSummaryExclusions);
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
    const fields = changedTriggerFields(change, entry, { before, after, trigger });
    context.summary.triggers.push(triggerSummary(context, { change, owner, trigger, fields }));
  }
}

/** Changed fields of an updated Trigger, or every field of an added or removed one. */
function changedTriggerFields(
  change: StoryChangeKind,
  entry: EntityEntry,
  triggers: { before: Trigger | undefined; after: Trigger | undefined; trigger: Trigger },
): StoryChangeFieldSummary[] {
  if (change !== 'updated') {
    return wholeEntityFields(
      change,
      toCanonicalTrigger(triggers.trigger),
      triggerSummaryExclusions,
    );
  }
  const previous = triggers.before === undefined ? undefined : toCanonicalTrigger(triggers.before);
  const next = triggers.after === undefined ? undefined : toCanonicalTrigger(triggers.after);
  const changed = entry.delta?.kind === 'object' ? Object.keys(entry.delta.fields) : [];
  return changed.map((field) => fieldSummary(field, previous, next));
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

/**
 * Every authored field of an added or removed entity, so that a new body,
 * effect, condition, probability or timer can be reviewed before it is
 * committed. Empty values are omitted.
 */
function wholeEntityFields(
  change: 'added' | 'removed',
  entity: object,
  exclusions: ReadonlySet<string>,
): StoryChangeFieldSummary[] {
  return Object.entries(entity)
    .filter(([field, value]) => !exclusions.has(field) && !isEmptyValue(value))
    .map(([field]) =>
      change === 'added'
        ? fieldSummary(field, undefined, entity)
        : fieldSummary(field, entity, undefined),
    );
}

function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

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

function fieldSummary(field: string, before: object | undefined, after: object | undefined) {
  const summary: StoryChangeFieldSummary = { field };
  for (const [side, source] of [
    ['before', before],
    ['after', after],
  ] as const) {
    const value: unknown = source === undefined ? undefined : Reflect.get(source, field);
    if (value === undefined) {
      continue;
    }
    const bounded = boundValue(value);
    summary[side] = bounded.value;
    if (bounded.truncated) {
      summary.truncated = true;
    }
  }
  return summary;
}

function boundValue(value: unknown): { value: unknown; truncated: boolean } {
  const { summaryTextLength, summaryValueLength } = STORY_CHANGE_BATCH_LIMITS;
  if (typeof value === 'string') {
    return value.length > summaryTextLength
      ? { value: `${value.slice(0, summaryTextLength)}…`, truncated: true }
      : { value, truncated: false };
  }
  const serialized = JSON.stringify(value);
  if (serialized.length > summaryValueLength) {
    return { value: { omitted: true, serializedLength: serialized.length }, truncated: true };
  }
  return { value, truncated: false };
}

function refOf(refsById: ReadonlyMap<string, string>, id: string): { ref?: string } {
  const ref = refsById.get(id);
  return ref === undefined ? {} : { ref };
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
