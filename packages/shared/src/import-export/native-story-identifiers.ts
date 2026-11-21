import type { NativeStoryContent } from './native-story.js';
import type { NativeStoryIdKind } from './native-story-remap.js';

export interface DuplicateNativeStoryIdentifier {
  id: string;
  path: string;
  firstPath: string;
}

type Identified = { id: string };
type Collection = { kind: string; values: readonly Identified[]; path: string };

const persistentKinds: ReadonlySet<string> = new Set<NativeStoryIdKind>([
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
]);

/** Entity IDs with global persistence keys; condition groups and blocks are scoped. */
export function collectNativeStoryPersistentIds(
  story: NativeStoryContent,
): Array<{ kind: NativeStoryIdKind; id: string }> {
  return identifierCollections(story).flatMap(({ kind, values }) =>
    isPersistentKind(kind) ? values.map(({ id }) => ({ kind, id })) : [],
  );
}

function isPersistentKind(kind: string): kind is NativeStoryIdKind {
  return persistentKinds.has(kind);
}

/** Check identifier uniqueness on structurally validated content; does not validate references. */
export function findDuplicateNativeStoryIdentifier(
  story: NativeStoryContent,
): DuplicateNativeStoryIdentifier | undefined {
  const seen = new Map<string, Map<string, string>>();
  for (const collection of identifierCollections(story)) {
    const duplicate = addIdentifiers(seen, collection);
    if (duplicate) {
      return duplicate;
    }
  }
  return undefined;
}

function identifierCollections(story: NativeStoryContent): Collection[] {
  return [
    { kind: 'interaction', values: story.interactions, path: '$.story.interactions' },
    { kind: 'location', values: story.locations ?? [], path: '$.story.locations' },
    { kind: 'character', values: story.characters ?? [], path: '$.story.characters' },
    {
      kind: 'statDefinition',
      values: story.statDefinitions ?? [],
      path: '$.story.statDefinitions',
    },
    {
      kind: 'itemDefinition',
      values: story.itemDefinitions ?? [],
      path: '$.story.itemDefinitions',
    },
    { kind: 'group', values: story.groups ?? [], path: '$.story.groups' },
    {
      kind: 'graphDecoration',
      values: story.graphDecorations ?? [],
      path: '$.story.graphDecorations',
    },
    { kind: 'statAssignment', values: story.stats ?? [], path: '$.story.stats' },
    ...ownerCollections(story),
    ...interactionCollections(story),
  ];
}

function ownerCollections(story: NativeStoryContent): Collection[] {
  const characters = (story.characters ?? []).flatMap((owner, index) => [
    {
      kind: 'statAssignment',
      values: owner.stats ?? [],
      path: `$.story.characters[${index}].stats`,
    },
    { kind: 'itemInstance', values: owner.items ?? [], path: `$.story.characters[${index}].items` },
  ]);
  const locations = (story.locations ?? []).flatMap((owner, index) => [
    {
      kind: 'statAssignment',
      values: owner.stats ?? [],
      path: `$.story.locations[${index}].stats`,
    },
    { kind: 'itemInstance', values: owner.items ?? [], path: `$.story.locations[${index}].items` },
  ]);
  const definitions = (story.itemDefinitions ?? []).map((owner, index) => ({
    kind: 'statAssignment',
    values: owner.stats ?? [],
    path: `$.story.itemDefinitions[${index}].stats`,
  }));
  return [...characters, ...locations, ...definitions];
}

function interactionCollections(story: NativeStoryContent): Collection[] {
  return story.interactions.flatMap((interaction, index) => {
    const path = `$.story.interactions[${index}]`;
    return [
      { kind: 'trigger', values: interaction.triggers, path: `${path}.triggers` },
      {
        kind: `block:${index}`,
        values: interaction.conditionalTextBlocks ?? [],
        path: `${path}.conditionalTextBlocks`,
      },
      ...interaction.triggers.map((trigger, triggerIndex) => ({
        kind: `conditionGroup:${index}:${triggerIndex}`,
        values: trigger.conditionGroups ?? [],
        path: `${path}.triggers[${triggerIndex}].conditionGroups`,
      })),
    ];
  });
}

function addIdentifiers(
  seen: Map<string, Map<string, string>>,
  { kind, values, path }: Collection,
): DuplicateNativeStoryIdentifier | undefined {
  const ids = seen.get(kind) ?? new Map<string, string>();
  seen.set(kind, ids);
  for (const [index, value] of values.entries()) {
    const idPath = `${path}[${index}].id`;
    const firstPath = ids.get(value.id);
    if (firstPath !== undefined) {
      return { id: value.id, path: idPath, firstPath };
    }
    ids.set(value.id, idPath);
  }
  return undefined;
}
