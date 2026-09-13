import { describe, expect, it } from 'vitest';
import {
  appendStoryContextPage,
  createStoryContextAccumulator,
  createStoryLoadingProjection,
  projectStoryContext,
  type StoryEditorBootstrap,
  type StoryEditorContextPage,
} from './story-loading.js';
import {
  autosaveId,
  readerSaveKind,
  READER_AUTOSAVE_ID,
  SIMULATION_AUTOSAVE_ID,
} from './reader-progress.js';

const bootstrap: StoryEditorBootstrap = {
  id: 'story-1',
  revision: 7,
  title: 'Story',
  startDateTime: '2026-09-13T08:00:00.000Z',
  owner: { id: 'owner-1', displayName: 'Owner' },
  createdAt: '2026-09-12T08:00:00.000Z',
  updatedAt: '2026-09-13T08:00:00.000Z',
  contextCounts: {
    locations: 1,
    characters: 1,
    statDefinitions: 1,
    statAssignments: 4,
    itemDefinitions: 2,
    itemInstances: 6,
    graphDecorations: 1,
  },
  interactionCount: 2,
  triggerCount: 1,
};

describe('story loading projections', () => {
  it('creates the initial projection from bootstrap metadata', () => {
    expect(createStoryLoadingProjection(bootstrap)).toEqual({
      id: 'story-1',
      revision: 7,
      title: 'Story',
      startDateTime: '2026-09-13T08:00:00.000Z',
      owner: { id: 'owner-1', displayName: 'Owner' },
      createdAt: '2026-09-12T08:00:00.000Z',
      updatedAt: '2026-09-13T08:00:00.000Z',
      locations: [],
      characters: [],
      stats: [],
      statDefinitions: [],
      itemDefinitions: [],
      graphDecorations: [],
      interactions: [],
    });
  });

  it('accumulates context pages and restores stat and nested-item ownership', () => {
    const context = createStoryContextAccumulator();
    const page: StoryEditorContextPage = {
      revision: 7,
      page: 1,
      pageSize: 100,
      hasMore: false,
      locations: [{ id: 'location-1', name: 'Harbor', description: 'At night' }],
      characters: [{ id: 'character-1', name: 'Mira', description: 'Investigator' }],
      statDefinitions: [{ id: 'stat-1', name: 'Courage' }],
      statAssignments: [
        {
          id: 'story-stat',
          statDefinitionId: 'stat-1',
          initialValue: 1,
          ownerType: 'story',
        },
        {
          id: 'character-stat',
          statDefinitionId: 'stat-1',
          initialValue: 2,
          ownerType: 'character',
          ownerId: 'character-1',
        },
        {
          id: 'location-stat',
          statDefinitionId: 'stat-1',
          initialValue: 3,
          ownerType: 'location',
          ownerId: 'location-1',
        },
        {
          id: 'item-stat',
          statDefinitionId: 'stat-1',
          initialValue: 4,
          ownerType: 'itemDefinition',
          ownerId: 'bag-definition',
        },
      ],
      itemDefinitions: [
        { id: 'bag-definition', name: 'Bag', description: '' },
        { id: 'note-definition', name: 'Note', description: '' },
      ],
      itemInstances: [
        {
          id: 'bag',
          itemDefinitionId: 'bag-definition',
          ownerType: 'character',
          ownerId: 'character-1',
        },
        {
          id: 'note',
          itemDefinitionId: 'note-definition',
          parentItemId: 'bag',
          relationshipType: 'contained',
          slotKey: 'inside',
        },
        {
          id: 'map',
          itemDefinitionId: 'note-definition',
          ownerType: 'location',
          ownerId: 'location-1',
        },
        { id: 'orphan', itemDefinitionId: 'note-definition', parentItemId: 'missing' },
        { id: 'cycle-a', itemDefinitionId: 'note-definition', parentItemId: 'cycle-b' },
        { id: 'cycle-b', itemDefinitionId: 'note-definition', parentItemId: 'cycle-a' },
      ],
      graphDecorations: [{ id: 'text-1', type: 'text', position: { x: 1, y: 2 }, text: 'Note' }],
    };

    appendStoryContextPage(context, page);
    appendStoryContextPage(context, {
      revision: 7,
      page: 2,
      pageSize: 100,
      hasMore: false,
      locations: [],
      characters: [],
      statDefinitions: [],
      statAssignments: [],
      itemDefinitions: [],
      itemInstances: [],
      graphDecorations: [
        { id: 'text-2', type: 'text', position: { x: 3, y: 4 }, text: 'Second note' },
      ],
    });

    const projected = projectStoryContext(createStoryLoadingProjection(bootstrap), context);

    expect(projected.stats).toEqual([
      { id: 'story-stat', statDefinitionId: 'stat-1', initialValue: 1 },
    ]);
    expect(projected.characters?.[0]).toMatchObject({
      id: 'character-1',
      stats: [{ id: 'character-stat', statDefinitionId: 'stat-1', initialValue: 2 }],
      items: [
        { id: 'bag', itemDefinitionId: 'bag-definition' },
        {
          id: 'note',
          itemDefinitionId: 'note-definition',
          parentItemId: 'bag',
          relationshipType: 'contained',
          slotKey: 'inside',
        },
      ],
    });
    expect(projected.locations?.[0]).toMatchObject({
      id: 'location-1',
      stats: [{ id: 'location-stat', statDefinitionId: 'stat-1', initialValue: 3 }],
      items: [{ id: 'map', itemDefinitionId: 'note-definition' }],
    });
    expect(projected.itemDefinitions?.[0].stats).toEqual([
      { id: 'item-stat', statDefinitionId: 'stat-1', initialValue: 4 },
    ]);
    expect(projected.graphDecorations).toHaveLength(2);
  });
});

describe('reader save identifiers', () => {
  it('maps autosave modes and save ids without conflating manual saves', () => {
    expect(autosaveId('reader')).toBe(READER_AUTOSAVE_ID);
    expect(autosaveId('simulation')).toBe(SIMULATION_AUTOSAVE_ID);
    expect(readerSaveKind(READER_AUTOSAVE_ID)).toBe('reader-autosave');
    expect(readerSaveKind(SIMULATION_AUTOSAVE_ID)).toBe('simulation-autosave');
    expect(readerSaveKind('manual-1')).toBe('manual');
  });
});
