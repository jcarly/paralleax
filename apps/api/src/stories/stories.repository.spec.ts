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
  saved.graphDecorations = [
    {
      id: 'frame-1',
      kind: 'frame',
      position: { x: 5, y: 15 },
      color: '#5b6ee1',
      width: 420,
      height: 240,
    },
    {
      id: 'text-1',
      kind: 'text',
      position: { x: 25, y: 35 },
      color: '#273043',
      text: 'Act one',
      fontSize: 32,
      fontFamily: 'sans',
      fontWeight: 'bold',
      fontStyle: 'italic',
    },
  ];
  saved.locations = [
    { id: 'location-1', name: 'Harbor', description: 'A quiet harbor.', category: 'Coast' },
  ];
  saved.statDefinitions = [
    {
      id: 'definition-1',
      name: 'Trust',
      valueType: 'number',
      category: 'Relationships',
      changePerHour: -0.5,
    },
  ];
  saved.itemDefinitions = [
    {
      id: 'item-definition-1',
      name: 'Key',
      description: 'A brass key.',
      category: 'Quest items',
      stats: [{ id: 'item-stat-1', statDefinitionId: 'definition-1', initialValue: 8 }],
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
      statEffects: [
        { statId: 'stat-1', operation: 'add', value: 1 },
        { itemId: 'item-1', statId: 'item-stat-1', operation: 'add', value: -1 },
      ],
      itemEffects: [{ itemId: 'item-1', operation: 'obtain' }],
      durationMinutes: 15,
      triggers: [{ id: 'trigger-1', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'interaction-2',
      title: 'Next',
      body: 'Continue here',
      position: { x: 30, y: 40 },
      durationMinutes: 0,
      triggers: [
        {
          id: 'trigger-2',
          inputInteractionIds: ['interaction-1'],
          conditions: [{ interactionId: 'interaction-1', hasBeenVisited: true }],
          position: { x: 220, y: 160 },
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
    creator_user_id: ownerId,
    owner_email: 'owner@example.com',
    visibility: 'private',
    edit_policy: 'owner',
    comment_policy: 'editors',
    actor_id: ownerId,
    actor_role: 'user',
    collaborator_role: null,
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
    if (sql.includes('FROM graph_decorations')) {
      return Promise.resolve({
        rows: (saved.graphDecorations ?? []).map((decoration, index) => ({
          id: decoration.id,
          story_id: saved.id,
          kind: decoration.kind,
          position_x: decoration.position.x,
          position_y: decoration.position.y,
          width: decoration.kind === 'frame' ? decoration.width : null,
          height: decoration.kind === 'frame' ? decoration.height : null,
          text_content: decoration.kind === 'text' ? decoration.text : null,
          color: decoration.color,
          font_size: decoration.kind === 'text' ? decoration.fontSize : null,
          font_family: decoration.kind === 'text' ? decoration.fontFamily : null,
          font_weight: decoration.kind === 'text' ? decoration.fontWeight : null,
          font_style: decoration.kind === 'text' ? decoration.fontStyle : null,
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
            item_id: effect.itemId ?? null,
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
    if (sql.includes('FROM stat_definitions')) {
      return Promise.resolve({
        rows: (saved.statDefinitions ?? []).map((definition, index) => ({
          id: definition.id,
          story_id: saved.id,
          name: definition.name,
          value_type: definition.valueType,
          category: definition.category ?? '',
          image_url: definition.imageUrl ?? '',
          change_per_hour: definition.changePerHour ?? 0,
          sort_order: index,
        })),
      });
    }
    if (sql.includes('FROM stat_assignments')) {
      const assignments = [
        ...(saved.stats ?? []).map((stat, index) => ({
          stat,
          owner_type: 'story',
          character_id: null,
          location_id: null,
          item_definition_id: null,
          sort_order: index,
        })),
        ...(saved.characters ?? []).flatMap((character) =>
          (character.stats ?? []).map((stat, index) => ({
            stat,
            owner_type: 'character',
            character_id: character.id,
            location_id: null,
            item_definition_id: null,
            sort_order: index,
          })),
        ),
        ...(saved.locations ?? []).flatMap((location) =>
          (location.stats ?? []).map((stat, index) => ({
            stat,
            owner_type: 'location',
            character_id: null,
            location_id: location.id,
            item_definition_id: null,
            sort_order: index,
          })),
        ),
        ...(saved.itemDefinitions ?? []).flatMap((definition) =>
          (definition.stats ?? []).map((stat, index) => ({
            stat,
            owner_type: 'item_definition',
            character_id: null,
            location_id: null,
            item_definition_id: definition.id,
            sort_order: index,
          })),
        ),
      ];
      return Promise.resolve({
        rows: assignments.map(({ stat, ...owner }) => ({
          id: stat.id,
          story_id: saved.id,
          stat_definition_id: stat.statDefinitionId,
          initial_value: stat.initialValue,
          ...owner,
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
            position_x: trigger.position?.x ?? null,
            position_y: trigger.position?.y ?? null,
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
          creator_user_id: ownerId,
          owner_email: 'owner@example.com',
          visibility: 'private',
          edit_policy: 'owner',
          comment_policy: 'editors',
          actor_id: ownerId,
          actor_role: 'user',
          collaborator_role: null,
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
        access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
        capabilities: { canRead: true, canEdit: true, canManage: true, canComment: true },
        owner: { id: ownerId, email: 'owner@example.com' },
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      },
    ]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('COUNT(interactions.id)'), [
      ownerId,
    ]);
  });

  it('lists only public story summaries with anonymous capabilities', async () => {
    const saved = story();
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          ...storyRow(saved),
          visibility: 'public',
          actor_id: null,
          actor_role: null,
          interaction_count: '2',
        },
      ],
    });

    await expect(repository().listPublic()).resolves.toEqual([
      {
        id: saved.id,
        revision: 1,
        title: saved.title,
        interactionCount: 2,
        startDateTime: saved.startDateTime,
        access: { visibility: 'public', editPolicy: 'owner', commentPolicy: 'editors' },
        capabilities: { canRead: true, canEdit: false, canManage: false, canComment: false },
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      },
    ]);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("visibility = 'public'"));
    expect(mockQuery).toHaveBeenCalledWith(expect.not.stringContaining('owner.email'));
  });

  it('finds and assembles a story by id', async () => {
    const saved = graphStory();
    relationalRead(mockQuery, saved);

    await expect(repository().find(saved.id, ownerId)).resolves.toEqual({
      ...saved,
      revision: 1,
      access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
      capabilities: { canRead: true, canEdit: true, canManage: true, canComment: true },
      owner: { id: ownerId, email: 'owner@example.com' },
      characters: saved.characters,
      interactions: saved.interactions.map((interaction) => ({
        ...interaction,
        locationId: interaction.locationId ?? null,
        characterIds: interaction.characterIds ?? [],
        statEffects: interaction.statEffects ?? [],
        itemEffects: interaction.itemEffects ?? [],
      })),
    });
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE stories.id = $1'), [
      saved.id,
      ownerId,
    ]);
  });

  it('assembles typed stat definitions, owner assignments, and interaction effects', async () => {
    const saved = graphStory();
    saved.statDefinitions = [
      {
        id: 'alarm-definition',
        name: 'Alarm',
        valueType: 'boolean',
      },
      {
        id: 'charge-definition',
        name: 'Charge',
        valueType: 'number',
      },
    ];
    saved.stats = [
      {
        id: 'story-stat-1',
        statDefinitionId: 'alarm-definition',
        initialValue: false,
      },
    ];
    saved.characters![0].stats = [
      {
        id: 'character-stat-1',
        statDefinitionId: 'charge-definition',
        initialValue: 2,
      },
    ];
    saved.itemDefinitions![0].stats = [
      {
        id: 'item-stat-1',
        statDefinitionId: 'charge-definition',
        initialValue: 10,
      },
    ];
    saved.interactions[0].statEffects = [
      {
        statId: 'story-stat-1',
        operation: 'set',
        value: true,
      },
      {
        statId: 'item-stat-1',
        itemId: 'item-1',
        operation: 'add',
        value: -1,
      },
    ];
    relationalRead(mockQuery, saved);

    const loaded = await repository().find(saved.id, ownerId);

    expect(loaded?.statDefinitions).toEqual(saved.statDefinitions);
    expect(loaded?.stats).toEqual(saved.stats);
    expect(loaded?.characters?.[0]).toMatchObject({
      id: 'character-1',
      stats: saved.characters![0].stats,
    });
    expect(loaded?.itemDefinitions?.[0]).toMatchObject({
      id: 'item-definition-1',
      stats: saved.itemDefinitions![0].stats,
    });
    expect(loaded?.interactions[0]).toMatchObject({
      id: 'interaction-1',
      statEffects: saved.interactions[0].statEffects,
    });
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
      'private',
      'owner',
      'editors',
    ]);
    expect(mockClientQuery).toHaveBeenCalledWith('DELETE FROM interactions WHERE story_id = $1', [
      saved.id,
    ]);
    expect(mockClientQuery).toHaveBeenCalledWith('COMMIT');
  });

  it('saves a demo catalog in one transaction', async () => {
    mockClientQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    const first = story();
    const second = { ...story(), id: 'story-2', title: 'Second demo' };

    await repository().saveMany([first, second], ownerId);

    expect(mockClientQuery.mock.calls.filter(([sql]) => sql === 'BEGIN')).toHaveLength(1);
    expect(mockClientQuery.mock.calls.filter(([sql]) => sql === 'COMMIT')).toHaveLength(1);
    expect(mockClientQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (id)'), [
      second.id,
      1,
      second.title,
      second.startDateTime,
      second.createdAt,
      second.updatedAt,
      ownerId,
      'private',
      'owner',
      'editors',
    ]);
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
      expect.stringContaining('INSERT INTO graph_decorations'),
      ['frame-1', saved.id, 'frame', 5, 15, 420, 240, null, '#5b6ee1', null, null, null, null, 0],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO graph_decorations'),
      [
        'text-1',
        saved.id,
        'text',
        25,
        35,
        null,
        null,
        'Act one',
        '#273043',
        32,
        'sans',
        'bold',
        'italic',
        1,
      ],
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
      ['definition-1', saved.id, 'Trust', 'number', 'Relationships', '', -0.5, 0],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO item_definitions'),
      ['item-definition-1', saved.id, 'Key', 'A brass key.', 'Quest items', '', 0],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO stat_assignments'),
      [expect.stringContaining('"id":"stat-1"')],
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
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM stories'), [
      'story-1',
      ownerId,
    ]);
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
    expect(mockClientQuery).not.toHaveBeenCalledWith(
      'DELETE FROM stat_definitions WHERE story_id = $1',
      [saved.id],
    );
  });

  it('writes typed stat effects without replacing unchanged definitions or assignments', async () => {
    const saved = graphStory();
    saved.stats = [
      {
        id: 'story-stat-1',
        statDefinitionId: 'definition-1',
        initialValue: 0,
      },
    ];
    relationalRead(mockClientQuery, saved);

    await repository().mutate(
      saved.id,
      (value) => {
        value.interactions[0].statEffects = [
          {
            statId: 'story-stat-1',
            operation: 'set',
            value: 5,
          },
        ];
        return value;
      },
      ownerId,
    );

    expect(mockClientQuery).not.toHaveBeenCalledWith(
      'DELETE FROM stat_assignments WHERE story_id = $1',
      [saved.id],
    );
    expect(mockClientQuery).not.toHaveBeenCalledWith(
      'DELETE FROM stat_definitions WHERE story_id = $1',
      [saved.id],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO interaction_stat_effects'),
      [saved.id, 'interaction-1', 'story-stat-1', null, 'set', JSON.stringify(5), 0],
    );
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
        value.interactions[0].triggers[0].position = { x: 210, y: 175 };
        value.interactions[0].triggers.push({
          id: 'trigger-3',
          inputInteractionIds: [],
          conditions: [],
        });
        value.interactions.splice(1, 1);
        const frame = value.graphDecorations?.find(({ id }) => id === 'frame-1');
        if (frame?.kind === 'frame') {
          frame.position = { x: 15, y: 25 };
          frame.width = 500;
        }
        value.graphDecorations = [
          frame!,
          {
            id: 'text-2',
            kind: 'text',
            position: { x: 70, y: 80 },
            color: '#123456',
            text: 'New label',
            fontSize: 24,
            fontFamily: 'serif',
            fontWeight: 'normal',
            fontStyle: 'italic',
          },
        ];
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
      null,
      null,
      JSON.stringify([]),
      1,
    ]);
    expect(mockClientQuery).toHaveBeenCalledWith(
      'UPDATE triggers SET position_x = $2, position_y = $3 WHERE id = $1',
      ['trigger-1', 210, 175],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      'UPDATE triggers SET conditions = $2 WHERE id = $1',
      ['trigger-1', JSON.stringify([{ interactionId: 'interaction-1', hasBeenVisited: false }])],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      'DELETE FROM graph_decorations WHERE id = $1 AND story_id = $2',
      ['text-1', saved.id],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        'UPDATE graph_decorations SET position_x = $2, position_y = $3, width = $4',
      ),
      ['frame-1', 15, 25, 500],
    );
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO graph_decorations'),
      [
        'text-2',
        saved.id,
        'text',
        70,
        80,
        null,
        null,
        'New label',
        '#123456',
        24,
        'serif',
        'normal',
        'italic',
        1,
      ],
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
        rows: [
          {
            slot_id: 'reader-autosave',
            name: null,
            state,
            created_at: new Date('2026-07-27T09:15:00.000Z'),
            updated_at: new Date('2026-07-27T09:15:00.000Z'),
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await expect(repository().findProgress('story-1', ownerId)).resolves.toEqual({
      id: 'reader-autosave',
      kind: 'reader-autosave',
      state,
      createdAt: '2026-07-27T09:15:00.000Z',
      updatedAt: '2026-07-27T09:15:00.000Z',
    });
    await expect(
      repository().saveProgress('story-1', ownerId, state, '2026-07-27T09:15:00.000Z'),
    ).resolves.toBe(true);
    await repository().deleteProgress('story-1', ownerId);

    expect(mockQuery).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO story_reader_progress'),
      [
        'story-1',
        ownerId,
        JSON.stringify(state),
        '2026-07-27T09:15:00.000Z',
        'reader-autosave',
        null,
        '2026-07-27T09:15:00.000Z',
      ],
    );
    expect(mockQuery).toHaveBeenLastCalledWith(
      'DELETE FROM story_reader_progress WHERE story_id = $1 AND user_id = $2 AND slot_id = $3',
      ['story-1', ownerId, 'reader-autosave'],
    );
  });
});
