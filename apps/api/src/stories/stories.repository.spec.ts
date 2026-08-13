import type { Story } from '@paralleax/shared';
import type { DatabaseConnection } from '../database/database.connection';
import { StoriesRepository } from './stories.repository';

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockRelease = jest.fn();
const mockConnect = jest.fn();
const ownerId = 'user-1';

function story(id = 'story-1'): Story {
  return {
    id,
    title: 'Repository story',
    startDateTime: '2026-01-01T08:00',
    interactions: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function graphStory(): Story {
  const saved = story();
  saved.locations = [
    { id: 'location-1', name: 'Harbor', description: 'A quiet harbor.', category: 'Coast' },
  ];
  saved.statDefinitions = [
    { id: 'definition-1', name: 'Trust', category: 'Relationships', changePerHour: -0.5 },
  ];
  saved.itemDefinitions = [
    {
      id: 'item-definition-1',
      name: 'Key',
      description: 'A brass key.',
      category: 'Quest items',
      stats: [{ statDefinitionId: 'definition-1', initialValue: 8 }],
    },
  ];
  saved.characters = [
    {
      id: 'character-1',
      name: 'Mira',
      description: 'An investigator.',
      category: 'Allies',
      stats: [{ id: 'stat-1', statDefinitionId: 'definition-1', initialValue: 2 }],
      items: [
        { id: 'item-1', itemDefinitionId: 'item-definition-1' },
        { id: 'item-2', itemDefinitionId: 'item-definition-1' },
      ],
    },
  ];
  saved.interactions = [
    {
      id: 'interaction-1',
      title: 'Start',
      body: 'Begin here',
      position: { x: 10, y: 20 },
      locationId: 'location-1',
      characterIds: ['character-1'],
      statEffects: [{ statId: 'stat-1', operation: 'add', value: 1 }],
      itemEffects: [{ itemId: 'item-1', operation: 'obtain' }],
      itemStatEffects: [
        {
          itemId: 'item-1',
          statDefinitionId: 'definition-1',
          operation: 'add',
          value: -1,
        },
      ],
      durationMinutes: 15,
      triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'interaction-2',
      title: 'Next',
      body: 'Continue here',
      position: { x: 30, y: 40 },
      durationMinutes: 0,
      itemStatEffects: [],
      triggers: [
        {
          id: 'trigger-2',
          inputInteractionIds: ['interaction-1'],
          conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
        },
      ],
    },
  ];
  return saved;
}

function storyRow(value = story()) {
  return {
    id: value.id,
    revision: value.revision ?? 1,
    title: value.title,
    start_date_time: value.startDateTime,
    created_at: new Date(value.createdAt),
    updated_at: new Date(value.updatedAt),
  };
}

function repository() {
  return new StoriesRepository({
    pool: { query: mockQuery, connect: mockConnect },
  } as unknown as DatabaseConnection);
}

function relationalRead(query: jest.Mock, saved = story()) {
  query.mockImplementation((sql: string) => {
    if (sql.includes('FROM stories'))
      return Promise.resolve({ rows: [storyRow(saved)], rowCount: 1 });
    if (sql.includes('FROM trigger_inputs')) {
      return Promise.resolve({
        rows: saved.interactions.flatMap((interaction) =>
          interaction.triggers.flatMap((trigger) =>
            trigger.inputInteractionIds.map((inputId, index) => ({
              story_id: saved.id,
              trigger_id: trigger.id,
              input_interaction_id: inputId,
              sort_order: index,
            })),
          ),
        ),
      });
    }
    if (sql.includes('FROM locations')) {
      return Promise.resolve({
        rows: (saved.locations ?? []).map((location, index) => ({
          id: location.id,
          story_id: saved.id,
          name: location.name,
          description: location.description,
          category: location.category ?? '',
          sort_order: index,
        })),
      });
    }
    if (sql.includes('FROM interaction_characters')) {
      return Promise.resolve({
        rows: saved.interactions.flatMap((interaction) =>
          (interaction.characterIds ?? []).map((characterId, index) => ({
            story_id: saved.id,
            interaction_id: interaction.id,
            character_id: characterId,
            sort_order: index,
          })),
        ),
      });
    }
    if (sql.includes('FROM interaction_stat_effects')) {
      return Promise.resolve({
        rows: saved.interactions.flatMap((interaction) =>
          (interaction.statEffects ?? []).map((effect, index) => ({
            story_id: saved.id,
            interaction_id: interaction.id,
            stat_id: effect.statId,
            operation: effect.operation,
            value: effect.value,
            sort_order: index,
          })),
        ),
      });
    }
    if (sql.includes('FROM interaction_item_effects')) {
      return Promise.resolve({
        rows: saved.interactions.flatMap((interaction) =>
          (interaction.itemEffects ?? []).map((effect, index) => ({
            story_id: saved.id,
            interaction_id: interaction.id,
            item_id: effect.itemId,
            operation: effect.operation,
            sort_order: index,
          })),
        ),
      });
    }
    if (sql.includes('FROM character_stats')) {
      return Promise.resolve({
        rows: (saved.characters ?? []).flatMap((character) =>
          (character.stats ?? []).map((stat, index) => ({
            id: stat.id,
            story_id: saved.id,
            character_id: character.id,
            stat_definition_id: stat.statDefinitionId,
            initial_value: stat.initialValue,
            sort_order: index,
          })),
        ),
      });
    }
    if (sql.includes('FROM stat_definitions')) {
      return Promise.resolve({
        rows: (saved.statDefinitions ?? []).map((definition, index) => ({
          id: definition.id,
          story_id: saved.id,
          name: definition.name,
          category: definition.category ?? '',
          image_url: definition.imageUrl ?? '',
          change_per_hour: definition.changePerHour ?? 0,
          sort_order: index,
        })),
      });
    }
    if (sql.includes('FROM item_definitions')) {
      return Promise.resolve({
        rows: (saved.itemDefinitions ?? []).map((definition, index) => ({
          id: definition.id,
          story_id: saved.id,
          name: definition.name,
          description: definition.description,
          category: definition.category ?? '',
          image_url: definition.imageUrl ?? '',
          stats: definition.stats ?? [],
          sort_order: index,
        })),
      });
    }
    if (sql.includes('FROM item_instances')) {
      return Promise.resolve({
        rows: [
          ...(saved.characters ?? []).flatMap((character) =>
            (character.items ?? []).map((item, index) => ({
              id: item.id,
              story_id: saved.id,
              character_id: item.parentItemId ? null : character.id,
              location_id: null,
              item_definition_id: item.itemDefinitionId,
              sort_order: index,
            })),
          ),
          ...(saved.locations ?? []).flatMap((location) =>
            (location.items ?? []).map((item, index) => ({
              id: item.id,
              story_id: saved.id,
              character_id: null,
              location_id: item.parentItemId ? null : location.id,
              item_definition_id: item.itemDefinitionId,
              sort_order: index,
            })),
          ),
        ],
      });
    }
    if (sql.includes('FROM item_instance_relationships')) {
      return Promise.resolve({
        rows: [...(saved.characters ?? []), ...(saved.locations ?? [])].flatMap((owner) =>
          (owner.items ?? []).flatMap((item, index) =>
            item.parentItemId && item.relationshipType
              ? [
                  {
                    story_id: saved.id,
                    parent_item_id: item.parentItemId,
                    child_item_id: item.id,
                    relationship_type: item.relationshipType,
                    slot_key: item.slotKey ?? null,
                    sort_order: index,
                  },
                ]
              : [],
          ),
        ),
      });
    }
    if (sql.includes('FROM characters')) {
      return Promise.resolve({
        rows: (saved.characters ?? []).map((character, index) => ({
          id: character.id,
          story_id: saved.id,
          name: character.name,
          description: character.description,
          category: character.category ?? '',
          sort_order: index,
        })),
      });
    }
    if (sql.includes('FROM triggers')) {
      return Promise.resolve({
        rows: saved.interactions.flatMap((interaction) =>
          interaction.triggers.map((trigger, index) => ({
            id: trigger.id,
            story_id: saved.id,
            output_interaction_id: interaction.id,
            sort_order: index,
            conditions: trigger.conditions,
          })),
        ),
      });
    }
    if (sql.includes('FROM interactions')) {
      return Promise.resolve({
        rows: saved.interactions.map((interaction, index) => ({
          id: interaction.id,
          story_id: saved.id,
          title: interaction.title,
          body: interaction.body,
          position_x: interaction.position.x,
          position_y: interaction.position.y,
          location_id: interaction.locationId ?? null,
          duration_minutes: interaction.durationMinutes ?? 0,
          item_stat_effects: interaction.itemStatEffects ?? [],
          sort_order: index,
        })),
      });
    }
    return Promise.resolve({ rows: [] });
  });
}

describe('StoriesRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConnect.mockResolvedValue({ query: mockClientQuery, release: mockRelease });
  });

  it('lists lightweight story summaries without assembling graphs', async () => {
    const saved = story();
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: saved.id,
          revision: 1,
          title: saved.title,
          start_date_time: saved.startDateTime,
          created_at: saved.createdAt,
          updated_at: saved.updatedAt,
          interaction_count: '3',
        },
      ],
    });

    const listed = await repository().list(ownerId);

    expect(listed).toEqual([
      {
        id: saved.id,
        revision: 1,
        title: saved.title,
        interactionCount: 3,
        startDateTime: saved.startDateTime,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      },
    ]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('COUNT(interactions.id)'), [
      ownerId,
    ]);
  });

  it('finds and assembles a story by id', async () => {
    const saved = graphStory();
    relationalRead(mockQuery, saved);

    await expect(repository().find(saved.id, ownerId)).resolves.toEqual({
      ...saved,
      revision: 1,
      characters: saved.characters,
      interactions: saved.interactions.map((interaction) => ({
        ...interaction,
        locationId: interaction.locationId ?? null,
        characterIds: interaction.characterIds ?? [],
        statEffects: interaction.statEffects ?? [],
        itemEffects: interaction.itemEffects ?? [],
      })),
    });
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1'), [
      saved.id,
      ownerId,
    ]);
  });

  it('returns no stories without querying graph tables when metadata is empty', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(repository().list(ownerId)).resolves.toEqual([]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('saves the story metadata and graph transactionally', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    const saved = story();

    await repository().save(saved, ownerId);

    expect(mockClientQuery).toHaveBeenCalledWith('BEGIN');
    expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (id)'), [
      saved.id,
      1,
      saved.title,
      saved.startDateTime,
      saved.createdAt,
      saved.updatedAt,
      ownerId,
    ]);
    expect(mockClientQuery).toHaveBeenCalledWith('DELETE FROM interactions WHERE story_id = $1', [
      saved.id,
    ]);
    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('inserts relational interactions, triggers, inputs, and conditions', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    const saved = graphStory();

    await repository().save(saved, ownerId);

    expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO locations'), [
      'location-1',
      saved.id,
      'Harbor',
      'A quiet harbor.',
      'Coast',
      '',
      0,
    ]);
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO interactions'),
      [expect.stringContaining('"id":"interaction-1"')],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO characters'),
      ['character-1', saved.id, 'Mira', 'An investigator.', 'Allies', '', false, 0],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO interaction_characters'),
      [expect.stringContaining('"character_id":"character-1"')],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stat_definitions'),
      ['definition-1', saved.id, 'Trust', 'Relationships', '', -0.5, 0],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO item_definitions'),
      [
        'item-definition-1',
        saved.id,
        'Key',
        'A brass key.',
        'Quest items',
        '',
        JSON.stringify(saved.itemDefinitions?.[0].stats),
        0,
      ],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO character_stats'),
      ['stat-1', saved.id, 'character-1', 'definition-1', 2, 0],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO item_instances'),
      ['item-1', saved.id, 'character-1', null, 'item-definition-1', 0],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO item_instances'),
      ['item-2', saved.id, 'character-1', null, 'item-definition-1', 1],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO interaction_stat_effects'),
      [expect.stringContaining('"stat_id":"stat-1"')],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO interaction_item_effects'),
      [expect.stringContaining('"item_id":"item-1"')],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO triggers'), [
      expect.stringContaining('"id":"trigger-2"'),
    ]);
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO trigger_inputs'),
      [expect.stringContaining('"trigger_id":"trigger-2"')],
    );
  });

  it('deletes stories by owner and id', async () => {
    mockQuery.mockResolvedValue({ rowCount: 1 });
    await expect(repository().delete('story-1', ownerId)).resolves.toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM stories WHERE id = $1 AND creator_user_id = $2',
      ['story-1', ownerId],
    );
  });

  it('writes only changed story fields during a mutation', async () => {
    const saved = story();
    let current = saved;
    mockClientQuery.mockImplementation((sql: string, values?: unknown[]) => {
      if (sql.includes('FROM stories'))
        return Promise.resolve({ rows: [storyRow(current)], rowCount: 1 });
      if (sql.startsWith('UPDATE stories SET')) {
        current = { ...current, title: values?.[1] as string, updatedAt: values?.[2] as string };
      }
      return Promise.resolve({ rows: [], rowCount: 1 });
    });

    const updated = await repository().mutate(
      saved.id,
      (value) => ({
        ...value,
        title: 'Updated transactionally',
        updatedAt: '2026-01-02T00:00:00.000Z',
      }),
      ownerId,
    );

    expect(updated?.title).toBe('Updated transactionally');
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE stories SET title = $2, updated_at = $3'),
      [saved.id, 'Updated transactionally', '2026-01-02T00:00:00.000Z'],
    );
    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('persists interaction and trigger graph differences', async () => {
    const saved = graphStory();
    relationalRead(mockClientQuery, saved);

    await repository().mutate(
      saved.id,
      (value) => {
        value.interactions[0].title = 'Renamed start';
        value.interactions[0].position = { x: 50, y: 60 };
        value.interactions[0].triggers[0].conditions = [
          { interactionId: 'interaction-1', hasBeenVisited: false },
        ];
        value.interactions[0].triggers.push({
          id: 'trigger-3',
          inputInteractionIds: [],
          conditions: [],
        });
        value.interactions.splice(1, 1);
        return value;
      },
      ownerId,
    );

    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        'UPDATE interactions SET title = $2, position_x = $3, position_y = $4',
      ),
      ['interaction-1', 'Renamed start', 50, 60],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      'DELETE FROM interactions WHERE id = $1 AND story_id = $2',
      ['interaction-2', saved.id],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO triggers'), [
      'trigger-3',
      saved.id,
      'interaction-1',
      JSON.stringify([]),
      1,
    ]);
    expect(mockClientQuery).toHaveBeenCalledWith(
      'UPDATE triggers SET conditions = $2 WHERE id = $1',
      ['trigger-1', JSON.stringify([{ interactionId: 'interaction-1', hasBeenVisited: false }])],
    );
  });

  it('persists a typed parent relationship and removes the child root owner', async () => {
    const saved = graphStory();
    relationalRead(mockClientQuery, saved);

    await repository().mutate(
      saved.id,
      (value) => {
        const items = value.characters?.[0].items ?? [];
        items[1].parentItemId = items[0].id;
        items[1].relationshipType = 'contained';
        items[1].slotKey = 'main';
        return value;
      },
      ownerId,
    );

    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE item_instances SET owner_character_id = $2'),
      ['item-2', null],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO item_instance_relationships'),
      [saved.id, 'item-1', 'item-2', 'contained', 'main', 1],
    );
  });

  it('transfers an item by id without deleting and recreating it', async () => {
    const saved = graphStory();
    saved.characters!.push({ id: 'character-2', name: 'Luc', description: '', items: [] });
    relationalRead(mockClientQuery, saved);

    await repository().mutate(
      saved.id,
      (value) => {
        const item = value.characters![0].items!.shift()!;
        value.characters![1].items!.push(item);
        return value;
      },
      ownerId,
    );

    expect(mockClientQuery).not.toHaveBeenCalledWith(
      'DELETE FROM item_instances WHERE id = $1 AND story_id = $2',
      expect.anything(),
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE item_instances SET owner_character_id = $2'),
      ['item-1', 'character-2'],
    );
  });

  it('transfers an item from a character root to a location root', async () => {
    const saved = graphStory();
    relationalRead(mockClientQuery, saved);

    await repository().mutate(
      saved.id,
      (value) => {
        const item = value.characters![0].items!.shift()!;
        value.locations![0].items = [item];
        return value;
      },
      ownerId,
    );

    expect(mockClientQuery).not.toHaveBeenCalledWith(
      'DELETE FROM item_instances WHERE id = $1 AND story_id = $2',
      expect.anything(),
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        'UPDATE item_instances SET owner_character_id = $2, owner_location_id = $3',
      ),
      ['item-1', null, 'location-1'],
    );
  });

  it('rolls back and releases the transaction when a mutation fails', async () => {
    relationalRead(mockClientQuery);
    await expect(
      repository().mutate(
        'story-1',
        () => {
          throw new Error('mutation failed');
        },
        ownerId,
      ),
    ).rejects.toThrow('mutation failed');

    expect(mockClientQuery).toHaveBeenLastCalledWith('ROLLBACK');
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('reads, upserts, and deletes user-scoped reader progress', async () => {
    const state = {
      version: 1 as const,
      journeyInteractionIds: ['interaction-1'],
      currentInteractionId: 'interaction-1',
      visitedInteractionIds: ['interaction-1'],
      currentDateTime: '2026-07-27T09:15',
      currentLocationId: null,
      statValues: {},
      ownedItemIds: [],
    };
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ state, updated_at: new Date('2026-07-27T09:15:00.000Z') }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(repository().findProgress('story-1', ownerId)).resolves.toEqual({
      state,
      updatedAt: '2026-07-27T09:15:00.000Z',
    });
    await expect(
      repository().saveProgress('story-1', ownerId, state, '2026-07-27T09:15:00.000Z'),
    ).resolves.toBe(true);
    await repository().deleteProgress('story-1', ownerId);

    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO story_reader_progress'),
      ['story-1', ownerId, JSON.stringify(state), '2026-07-27T09:15:00.000Z'],
    );
    expect(mockQuery).toHaveBeenLastCalledWith(
      'DELETE FROM story_reader_progress WHERE story_id = $1 AND user_id = $2',
      ['story-1', ownerId],
    );
  });
});
