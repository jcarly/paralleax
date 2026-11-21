import {
  collectNativeStoryPersistentIds,
  findDuplicateNativeStoryIdentifier,
} from './native-story-identifiers.js';
import type { NativeStoryIdKind, NativeStoryIdMaps } from './native-story-remap.js';
import type { NativeStoryContent } from './native-story.js';

export type NativeStoryIdOccupied = (kind: NativeStoryIdKind, id: string) => boolean;
export type NativeStoryIdCandidate = (
  kind: NativeStoryIdKind,
  originalId: string,
  attempt: number,
) => string;

/** Reserve source IDs, replacing only collisions. Occupancy must include all destination IDs. */
export function planNativeStoryIdRemapping(
  story: NativeStoryContent,
  isOccupied: NativeStoryIdOccupied,
  candidateFor: NativeStoryIdCandidate,
): NativeStoryIdMaps {
  if (findDuplicateNativeStoryIdentifier(story)) {
    throw new Error('Cannot remap duplicate identifiers');
  }
  const entries = collectNativeStoryPersistentIds(story);
  const reserved = new Map<NativeStoryIdKind, Set<string>>();
  for (const { kind, id } of entries) {
    const ids = reserved.get(kind) ?? new Set<string>();
    ids.add(id);
    reserved.set(kind, ids);
  }
  const result: Partial<Record<NativeStoryIdKind, Map<string, string>>> = {};
  for (const { kind, id } of entries) {
    if (!isOccupied(kind, id)) {
      continue;
    }
    const used = reserved.get(kind);
    if (!used) {
      throw new Error('Missing identifier reservation');
    }
    const candidate = findAvailableCandidate(kind, id, used, { isOccupied, candidateFor });
    const mapping = result[kind] ?? new Map<string, string>();
    mapping.set(id, candidate);
    result[kind] = mapping;
    used.add(candidate);
  }
  return result;
}

function findAvailableCandidate(
  kind: NativeStoryIdKind,
  id: string,
  reserved: ReadonlySet<string>,
  allocator: { isOccupied: NativeStoryIdOccupied; candidateFor: NativeStoryIdCandidate },
): string {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = allocator.candidateFor(kind, id, attempt);
    if (
      candidate.length > 0 &&
      !reserved.has(candidate) &&
      !allocator.isOccupied(kind, candidate)
    ) {
      return candidate;
    }
  }
  throw new Error('Cannot allocate a unique Story identifier');
}
