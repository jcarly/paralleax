import type { StatAssignment, StatDefinition, Story } from '../model/index.js';
import { getStatValueType } from '../model/stats.js';
import { getStatAssignmentOwners, type StatOwnerType } from '../stats/targets.js';
import {
  fieldSummary,
  refOf,
  wholeEntityFields,
  type StoryChangeFieldSummary,
  type SummaryFieldContext,
} from './summary-fields.js';

export type StoryChangeStatChangeKind = 'added' | 'updated' | 'removed';

export interface StoryChangeStatDefinitionSummary {
  change: StoryChangeStatChangeKind;
  id: string;
  ref?: string;
  name: string;
  valueType: string;
  fields: StoryChangeFieldSummary[];
}

export interface StoryChangeStatAssignmentSummary {
  change: StoryChangeStatChangeKind;
  id: string;
  ref?: string;
  definition: { id: string; ref?: string; name: string; valueType: string };
  owner: { type: StatOwnerType; id?: string; ref?: string; name?: string };
  fields: StoryChangeFieldSummary[];
}

export interface StoryChangeStatsSummary {
  statDefinitions: StoryChangeStatDefinitionSummary[];
  statAssignments: StoryChangeStatAssignmentSummary[];
}

interface AssignmentEntry {
  assignment: StatAssignment;
  owner: StoryChangeStatAssignmentSummary['owner'];
}

const definitionSummaryExclusions = new Set(['id', 'name', 'valueType']);

/**
 * Every stat definition and assignment added, updated or removed by the batch,
 * whoever owns the assignment. Assignments are compared directly, so nothing
 * depends on how the owner entity (Story, character, location or item
 * definition) is summarized: those summaries leave `stats` out.
 */
export function summarizeStats(
  context: SummaryFieldContext,
  before: Story,
  after: Story,
): StoryChangeStatsSummary {
  const definitions = summarizeDefinitions(context, before, after);
  const assignments = summarizeAssignments(context, before, after);
  return { statDefinitions: definitions, statAssignments: assignments };
}

function byId<T extends { id: string }>(items: readonly T[] | undefined): Map<string, T> {
  return new Map((items ?? []).map((item) => [item.id, item]));
}

function summarizeDefinitions(
  context: SummaryFieldContext,
  before: Story,
  after: Story,
): StoryChangeStatDefinitionSummary[] {
  const previous = byId(before.statDefinitions);
  const next = byId(after.statDefinitions);
  const ids = new Set([...previous.keys(), ...next.keys()]);
  const summaries: StoryChangeStatDefinitionSummary[] = [];
  for (const id of ids) {
    const was = previous.get(id);
    const now = next.get(id);
    const current = now ?? was;
    if (!current) {
      continue;
    }
    const change = changeOf(was, now);
    const fields = changedFields(context, change, { was, now });
    if (change === 'updated' && fields.length === 0) {
      continue;
    }
    summaries.push({
      change,
      id,
      ...refOf(context.refsById, id),
      name: current.name,
      valueType: getStatValueType(current),
      fields,
    });
  }
  return summaries;
}

function summarizeAssignments(
  context: SummaryFieldContext,
  before: Story,
  after: Story,
): StoryChangeStatAssignmentSummary[] {
  const previous = assignmentEntries(before);
  const next = assignmentEntries(after);
  const definitions = new Map([...byId(before.statDefinitions), ...byId(after.statDefinitions)]);
  const summaries: StoryChangeStatAssignmentSummary[] = [];
  for (const id of new Set([...previous.keys(), ...next.keys()])) {
    const was = previous.get(id);
    const now = next.get(id);
    const current = now ?? was;
    if (!current) {
      continue;
    }
    const change = changeOf(was?.assignment, now?.assignment);
    const fields = assignmentFields(context, change, was?.assignment, now?.assignment);
    if (change === 'updated' && fields.length === 0) {
      continue;
    }
    summaries.push({
      change,
      id,
      ...refOf(context.refsById, id),
      definition: definitionOf(context, definitions, current.assignment),
      owner: ownerOf(context, current.owner),
      fields,
    });
  }
  return summaries;
}

function assignmentEntries(story: Story): Map<string, AssignmentEntry> {
  return new Map(
    getStatAssignmentOwners(story).flatMap((owner) =>
      owner.assignments.map((assignment) => [
        assignment.id,
        {
          assignment,
          owner: {
            type: owner.ownerType,
            ...(owner.ownerId === undefined ? {} : { id: owner.ownerId }),
            ...(owner.ownerName === undefined ? {} : { name: owner.ownerName }),
          },
        },
      ]),
    ),
  );
}

/** The initial value is always listed, even when empty or zero. */
function assignmentFields(
  context: SummaryFieldContext,
  change: StoryChangeStatChangeKind,
  was: StatAssignment | undefined,
  now: StatAssignment | undefined,
): StoryChangeFieldSummary[] {
  if (change === 'updated' && was?.initialValue === now?.initialValue) {
    return [];
  }
  return [fieldSummary(context, 'initialValue', was, now)];
}

function definitionOf(
  context: SummaryFieldContext,
  definitions: ReadonlyMap<string, StatDefinition>,
  assignment: StatAssignment,
): StoryChangeStatAssignmentSummary['definition'] {
  const definition = definitions.get(assignment.statDefinitionId);
  return {
    id: assignment.statDefinitionId,
    ...refOf(context.refsById, assignment.statDefinitionId),
    name: definition?.name ?? '',
    valueType: definition === undefined ? 'number' : getStatValueType(definition),
  };
}

function ownerOf(
  context: SummaryFieldContext,
  owner: StoryChangeStatAssignmentSummary['owner'],
): StoryChangeStatAssignmentSummary['owner'] {
  return owner.id === undefined ? owner : { ...owner, ...refOf(context.refsById, owner.id) };
}

function changeOf(was: unknown, now: unknown): StoryChangeStatChangeKind {
  if (was === undefined) {
    return 'added';
  }
  return now === undefined ? 'removed' : 'updated';
}

function changedFields(
  context: SummaryFieldContext,
  change: StoryChangeStatChangeKind,
  definitions: { was: StatDefinition | undefined; now: StatDefinition | undefined },
): StoryChangeFieldSummary[] {
  const { was, now } = definitions;
  const exclusions = definitionSummaryExclusions;
  if (change === 'added' && now) {
    return wholeEntityFields(context, change, now, exclusions);
  }
  if (change === 'removed' && was) {
    return wholeEntityFields(context, change, was, exclusions);
  }
  const keys = new Set([...Object.keys(was ?? {}), ...Object.keys(now ?? {})]);
  return [...keys]
    .filter(
      (field) =>
        !exclusions.has(field) &&
        JSON.stringify(Reflect.get(was ?? {}, field)) !==
          JSON.stringify(Reflect.get(now ?? {}, field)),
    )
    .map((field) => fieldSummary(context, field, was, now));
}

/**
 * Decides whether a Story field is reported by `summarizeStats`: definitions
 * and Story-level assignments always are; item definitions only when nothing
 * but their `stats` changed. `undefined` means the field is not a stat field.
 */
export function isStatField(
  field: string,
  entries: Record<string, { delta?: { kind: string; fields?: Record<string, unknown> } }>,
): boolean | undefined {
  if (field === 'statDefinitions' || field === 'stats') {
    return true;
  }
  if (field !== 'itemDefinitions') {
    return undefined;
  }
  return Object.values(entries).every(
    (entry) =>
      entry.delta?.kind === 'object' &&
      Object.keys(entry.delta.fields ?? {}).every((changed) => changed === 'stats'),
  );
}

export function statCounts(stats: StoryChangeStatsSummary) {
  const count = (items: { change: string }[], change: string) =>
    items.filter((item) => item.change === change).length;
  return {
    statDefinitionsAdded: count(stats.statDefinitions, 'added'),
    statDefinitionsUpdated: count(stats.statDefinitions, 'updated'),
    statAssignmentsAdded: count(stats.statAssignments, 'added'),
    statAssignmentsUpdated: count(stats.statAssignments, 'updated'),
  };
}
