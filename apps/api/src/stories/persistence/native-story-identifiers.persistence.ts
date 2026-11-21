import { createHash } from 'node:crypto';
import {
  collectNativeStoryPersistentIds,
  planNativeStoryIdRemapping,
  type NativeStoryContent,
  type NativeStoryIdKind,
  type NativeStoryIdMaps,
} from '@paralleax/shared';
import type { Queryable } from './stories.persistence.types';
import { NativeStoryIdAllocationError } from '../application/native-story-import.port';

const tables: Record<NativeStoryIdKind, string> = {
  interaction: 'interactions',
  trigger: 'triggers',
  character: 'characters',
  location: 'locations',
  statDefinition: 'stat_definitions',
  statAssignment: 'stat_assignments',
  itemDefinition: 'item_definitions',
  itemInstance: 'item_instances',
  group: 'story_groups',
  graphDecoration: 'graph_decorations',
};

type IdEntry = { kind: NativeStoryIdKind; id: string };
type OccupiedIds = Map<NativeStoryIdKind, Set<string>>;
const kinds = [
  'interaction',
  'trigger',
  'character',
  'location',
  'statDefinition',
  'statAssignment',
  'itemDefinition',
  'itemInstance',
  'group',
  'graphDecoration',
] as const satisfies readonly NativeStoryIdKind[];

/** Read global ID collisions and deterministically plan replacements in the current transaction. */
export async function planNativeStoryPersistenceIds(
  client: Queryable,
  content: NativeStoryContent,
  newStoryId: string,
): Promise<NativeStoryIdMaps> {
  const occupied: OccupiedIds = new Map();
  await collectOccupied(client, collectNativeStoryPersistentIds(content), occupied);
  for (let pass = 0; pass < 5; pass += 1) {
    const maps = planNativeStoryIdRemapping(
      content,
      (kind, id) => occupied.get(kind)?.has(id) ?? false,
      (kind, id, attempt) => deterministicId(newStoryId, kind, id, attempt),
    );
    const collisions = await collectOccupied(client, mappedIds(maps), occupied);
    if (collisions === 0) {
      return maps;
    }
  }
  throw new NativeStoryIdAllocationError('Unable to allocate Story identifiers');
}

function deterministicId(
  storyId: string,
  kind: NativeStoryIdKind,
  id: string,
  attempt: number,
): string {
  const hash = createHash('sha256')
    .update(JSON.stringify([storyId, kind, id, attempt]))
    .digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function mappedIds(maps: NativeStoryIdMaps): IdEntry[] {
  return kinds.flatMap((kind) => [...(maps[kind]?.values() ?? [])].map((id) => ({ kind, id })));
}

async function collectOccupied(
  client: Queryable,
  entries: readonly IdEntry[],
  occupied: OccupiedIds,
): Promise<number> {
  const grouped = new Map<NativeStoryIdKind, string[]>();
  for (const { kind, id } of entries) {
    const ids = grouped.get(kind) ?? [];
    ids.push(id);
    grouped.set(kind, ids);
  }
  let found = 0;
  for (const [kind, ids] of grouped) {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM ${tables[kind]} WHERE id = ANY($1::text[])`,
      [ids],
    );
    const known = occupied.get(kind) ?? new Set<string>();
    for (const row of result.rows) {
      if (!known.has(row.id)) {
        found += 1;
      }
      known.add(row.id);
    }
    occupied.set(kind, known);
  }
  return found;
}
