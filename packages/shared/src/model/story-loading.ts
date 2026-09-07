import type { Character } from './characters.js';
import type { GraphDecoration } from './graph-decorations.js';
import type { ConditionalTextBlock, Interaction } from './interactions.js';
import type { ItemDefinition, ItemEffect, ItemInstance } from './items.js';
import type { Location } from './locations.js';
import type { StatAssignment, StatDefinition, StatEffect } from './stats.js';
import type { Story } from './stories.js';
import type { Trigger, TriggerConditionGroup } from './triggers.js';

export const STORY_LIST_PAGE_SIZE = 24;
export const STORY_EDITOR_PAGE_SIZE = 100;
export const MAX_STORY_PAGE_SIZE = 200;

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
}

export type StoryListFilter = 'all' | 'editable' | 'commentable' | 'owned';
export type StoryListSort = 'updated' | 'title';

export interface StoryListOptions {
  page: number;
  pageSize: number;
  query?: string;
  filter?: StoryListFilter;
  sort?: StoryListSort;
}

export interface StoryEditorContextCounts {
  locations: number;
  characters: number;
  statDefinitions: number;
  statAssignments: number;
  itemDefinitions: number;
  itemInstances: number;
  graphDecorations: number;
}

export interface StoryEditorBootstrap extends Pick<
  Story,
  | 'id'
  | 'revision'
  | 'title'
  | 'startDateTime'
  | 'access'
  | 'capabilities'
  | 'owner'
  | 'createdAt'
  | 'updatedAt'
> {
  contextCounts: StoryEditorContextCounts;
  interactionCount: number;
  triggerCount: number;
}

export type StoryEditorStatOwnerType = 'story' | 'character' | 'location' | 'itemDefinition';

export interface StoryEditorStatAssignment extends StatAssignment {
  ownerType: StoryEditorStatOwnerType;
  ownerId?: string;
}

export interface StoryEditorItemInstance extends ItemInstance {
  ownerType?: 'character' | 'location';
  ownerId?: string;
}

export interface StoryEditorPageMetadata {
  revision: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface StoryEditorContextPage extends StoryEditorPageMetadata {
  locations: Location[];
  characters: Character[];
  statDefinitions: StatDefinition[];
  statAssignments: StoryEditorStatAssignment[];
  itemDefinitions: ItemDefinition[];
  itemInstances: StoryEditorItemInstance[];
  graphDecorations: GraphDecoration[];
}

export type StoryEditorInteractionSummary = Pick<
  Interaction,
  'id' | 'title' | 'position' | 'locationId'
>;

export interface StoryEditorInteractionPage extends StoryEditorPageMetadata {
  interactions: StoryEditorInteractionSummary[];
}

export interface StoryEditorTriggerStructure extends Pick<
  Trigger,
  'id' | 'inputInteractionIds' | 'position'
> {
  outputInteractionId: string;
}

export interface StoryEditorTriggerPage extends StoryEditorPageMetadata {
  triggers: StoryEditorTriggerStructure[];
}

export interface StoryEditorInteractionContent {
  interactionId: string;
  body: string;
  durationMinutes?: number;
  characterIds?: string[];
  statEffects?: StatEffect[];
  itemEffects?: ItemEffect[];
  conditionalTextBlocks?: ConditionalTextBlock[];
}

export interface StoryEditorInteractionContentPage extends StoryEditorPageMetadata {
  interactions: StoryEditorInteractionContent[];
}

export interface StoryEditorTriggerContent {
  triggerId: string;
  conditionGroups?: TriggerConditionGroup[];
  appearanceProbability?: number;
  timerSeconds?: number | null;
}

export interface StoryEditorTriggerContentPage extends StoryEditorPageMetadata {
  triggers: StoryEditorTriggerContent[];
}

export interface StoryEditorLoadingProjection {
  story: Story;
  phase: 'context' | 'interactions' | 'triggers' | 'content' | 'ready';
}

export type StoryRuntimeBootstrap = StoryEditorBootstrap;

export type StoryRuntimeContextPage = StoryEditorContextPage;

export interface StoryRuntimeSliceRequest {
  currentInteractionId?: string | null;
  interactionIds?: string[];
  includeOptions?: boolean;
  page: number;
  pageSize: number;
}

export interface StoryRuntimeSlice {
  revision: number;
  page: number;
  pageSize: number;
  totalOptionCount: number;
  hasMore: boolean;
  optionInteractionIds: string[];
  interactionReferences: Array<Pick<Interaction, 'id' | 'title'>>;
  interactions: Interaction[];
}

export interface StoryContextAccumulator {
  locations: StoryEditorContextPage['locations'];
  characters: StoryEditorContextPage['characters'];
  statDefinitions: StoryEditorContextPage['statDefinitions'];
  statAssignments: StoryEditorStatAssignment[];
  itemDefinitions: StoryEditorContextPage['itemDefinitions'];
  itemInstances: StoryEditorItemInstance[];
  graphDecorations: StoryEditorContextPage['graphDecorations'];
}

export function createStoryContextAccumulator(): StoryContextAccumulator {
  return {
    locations: [],
    characters: [],
    statDefinitions: [],
    statAssignments: [],
    itemDefinitions: [],
    itemInstances: [],
    graphDecorations: [],
  };
}

export function appendStoryContextPage(
  context: StoryContextAccumulator,
  page: StoryEditorContextPage,
): void {
  context.locations.push(...page.locations);
  context.characters.push(...page.characters);
  context.statDefinitions.push(...page.statDefinitions);
  context.statAssignments.push(...page.statAssignments);
  context.itemDefinitions.push(...page.itemDefinitions);
  context.itemInstances.push(...page.itemInstances);
  context.graphDecorations.push(...page.graphDecorations);
}

export function projectStoryContext(story: Story, context: StoryContextAccumulator): Story {
  const assignmentsByOwner = groupBy(
    context.statAssignments,
    (assignment) => `${assignment.ownerType}:${assignment.ownerId ?? ''}`,
  );
  const itemsByOwner = groupItemsByOwner(context.itemInstances);
  return {
    ...story,
    locations: context.locations.map((location) => ({
      ...location,
      stats: stripStatOwners(assignmentsByOwner.get(`location:${location.id}`)),
      items: itemsByOwner.get(`location:${location.id}`) ?? [],
    })),
    characters: context.characters.map((character) => ({
      ...character,
      stats: stripStatOwners(assignmentsByOwner.get(`character:${character.id}`)),
      items: itemsByOwner.get(`character:${character.id}`) ?? [],
    })),
    stats: stripStatOwners(assignmentsByOwner.get('story:')),
    statDefinitions: context.statDefinitions,
    itemDefinitions: context.itemDefinitions.map((definition) => ({
      ...definition,
      stats: stripStatOwners(assignmentsByOwner.get(`itemDefinition:${definition.id}`)),
    })),
    graphDecorations: context.graphDecorations,
  };
}

export function createStoryLoadingProjection(bootstrap: StoryEditorBootstrap): Story {
  return {
    id: bootstrap.id,
    revision: bootstrap.revision,
    title: bootstrap.title,
    startDateTime: bootstrap.startDateTime,
    access: bootstrap.access,
    capabilities: bootstrap.capabilities,
    owner: bootstrap.owner,
    createdAt: bootstrap.createdAt,
    updatedAt: bootstrap.updatedAt,
    locations: [],
    characters: [],
    stats: [],
    statDefinitions: [],
    itemDefinitions: [],
    graphDecorations: [],
    interactions: [],
  };
}

function groupItemsByOwner(
  items: StoryEditorItemInstance[],
): Map<string, StoryEditorItemInstance[]> {
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const result = new Map<string, StoryEditorItemInstance[]>();
  for (const item of items) {
    const owner = resolveItemOwner(item, itemsById);
    if (!owner) continue;
    const key = `${owner.ownerType}:${owner.ownerId}`;
    result.set(key, [...(result.get(key) ?? []), projectItemInstance(item)]);
  }
  return result;
}

function projectItemInstance(item: StoryEditorItemInstance): ItemInstance {
  return {
    id: item.id,
    itemDefinitionId: item.itemDefinitionId,
    ...(item.parentItemId ? { parentItemId: item.parentItemId } : {}),
    ...(item.relationshipType ? { relationshipType: item.relationshipType } : {}),
    ...(item.slotKey ? { slotKey: item.slotKey } : {}),
  };
}

function resolveItemOwner(
  item: StoryEditorItemInstance,
  itemsById: ReadonlyMap<string, StoryEditorItemInstance>,
): Pick<StoryEditorItemInstance, 'ownerType' | 'ownerId'> | undefined {
  const visited = new Set<string>();
  let current: StoryEditorItemInstance | undefined = item;
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.ownerType && current.ownerId) {
      return { ownerType: current.ownerType, ownerId: current.ownerId };
    }
    current = current.parentItemId ? itemsById.get(current.parentItemId) : undefined;
  }
  return undefined;
}

function stripStatOwners(assignments: StoryEditorStatAssignment[] | undefined) {
  return (assignments ?? []).map(
    ({ ownerType: _ownerType, ownerId: _ownerId, ...assignment }) => assignment,
  );
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const item of items) grouped.set(keyOf(item), [...(grouped.get(keyOf(item)) ?? []), item]);
  return grouped;
}
