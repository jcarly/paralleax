import { STORY_CHANGE_BATCH_LIMITS } from './contract.js';

/** An entity created by the batch, found inside a field value. */
export interface StoryChangeFieldReference {
  /** The ID as it appears in the value: provisional in a preview. */
  id: string;
  /** The temporary reference name of the created entity. */
  ref: string;
}

export interface StoryChangeFieldSummary {
  field: string;
  before?: unknown;
  after?: unknown;
  /** True when a value was shortened to keep the summary bounded. */
  truncated?: boolean;
  /** Entities created by this batch that the value names, with their `ref`. */
  references?: StoryChangeFieldReference[];
}

/** Everything the field summaries need: the references of created entities. */
export interface SummaryFieldContext {
  refsById: ReadonlyMap<string, string>;
}

/**
 * Every authored field of an added or removed entity, so that a new body,
 * effect, condition, probability or timer can be reviewed before it is
 * committed. Empty values are omitted.
 */
export function wholeEntityFields(
  context: SummaryFieldContext,
  change: 'added' | 'removed',
  entity: object,
  exclusions: ReadonlySet<string>,
): StoryChangeFieldSummary[] {
  return Object.entries(entity)
    .filter(([field, value]) => !exclusions.has(field) && !isEmptyValue(value))
    .map(([field]) =>
      change === 'added'
        ? fieldSummary(context, field, undefined, entity)
        : fieldSummary(context, field, entity, undefined),
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

export function fieldSummary(
  context: SummaryFieldContext,
  field: string,
  before: object | undefined,
  after: object | undefined,
) {
  const summary: StoryChangeFieldSummary = { field };
  const references = new Map<string, StoryChangeFieldReference>();
  for (const [side, source] of [
    ['before', before],
    ['after', after],
  ] as const) {
    const value: unknown = source === undefined ? undefined : Reflect.get(source, field);
    if (value === undefined) {
      continue;
    }
    for (const reference of referencedEntities(value, context.refsById)) {
      references.set(reference.id, reference);
    }
    const bounded = boundValue(value);
    summary[side] = bounded.value;
    if (bounded.truncated) {
      summary.truncated = true;
    }
  }
  if (references.size > 0) {
    summary.references = [...references.values()];
  }
  return summary;
}

/** Entities created by the batch that a field value names, found by their ID. */
function referencedEntities(
  value: unknown,
  refsById: ReadonlyMap<string, string>,
): StoryChangeFieldReference[] {
  if (typeof value === 'string') {
    const ref = refsById.get(value);
    return ref === undefined ? [] : [{ id: value, ref }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item: unknown) => referencedEntities(item, refsById));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap((item: unknown) => referencedEntities(item, refsById));
  }
  return [];
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

export function refOf(refsById: ReadonlyMap<string, string>, id: string): { ref?: string } {
  const ref = refsById.get(id);
  return ref === undefined ? {} : { ref };
}
