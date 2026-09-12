import type { Queryable } from './stories.persistence.types';
import {
  readStoryEditorContextPage,
  readStoryEditorInteractionContentPage,
  readStoryEditorInteractionPage,
  readStoryEditorTriggerContentPage,
  readStoryEditorTriggerPage,
} from './story-editor.persistence';

describe('Story editor persistence projections', () => {
  const query = jest.fn();
  const client = { query } as unknown as Queryable;

  beforeEach(() => query.mockReset());

  it('maps every context collection and optional field', async () => {
    query.mockImplementation((sql: string) => {
      if (sql.includes('FROM locations')) {
        return Promise.resolve({
          rows: [
            contextRow('location-1', 'Harbor', 'Coast', 'harbor.png'),
            contextRow('location-2', 'Street'),
          ],
        });
      }
      if (sql.includes('FROM characters')) {
        return Promise.resolve({
          rows: [
            { ...contextRow('character-1', 'Mira', 'Allies', 'mira.png'), is_playable: true },
            { ...contextRow('character-2', 'Noah'), is_playable: false },
          ],
        });
      }
      if (sql.includes('FROM stat_definitions')) {
        return Promise.resolve({
          rows: [
            {
              id: 'definition-1',
              name: 'Courage',
              value_type: 'number',
              category: 'Mind',
              image_url: 'courage.png',
              change_per_hour: 2,
              sort_order: 0,
            },
            {
              id: 'definition-2',
              name: 'Alarm',
              value_type: 'boolean',
              category: '',
              image_url: '',
              change_per_hour: 0,
              sort_order: 1,
            },
          ],
        });
      }
      if (sql.includes('FROM stat_assignments')) {
        return Promise.resolve({
          rows: [
            assignmentRow('story-stat', 'story'),
            assignmentRow('character-stat', 'character', { character_id: 'character-1' }),
            assignmentRow('location-stat', 'location', { location_id: 'location-1' }),
            assignmentRow('item-stat', 'item_definition', {
              item_definition_id: 'definition-item-1',
            }),
          ],
        });
      }
      if (sql.includes('FROM item_definitions')) {
        return Promise.resolve({
          rows: [
            contextRow('definition-item-1', 'Coat', 'Clothing', 'coat.png'),
            contextRow('definition-item-2', 'Key'),
          ],
        });
      }
      if (sql.includes('FROM item_instances')) {
        return Promise.resolve({
          rows: [
            itemRow('item-1', { owner_character_id: 'character-1' }),
            itemRow('item-2', { owner_location_id: 'location-1' }),
            itemRow('item-3', {
              parent_item_id: 'item-1',
              relationship_type: 'worn',
              slot_key: 'torso',
            }),
            itemRow('item-4'),
          ],
        });
      }
      if (sql.includes('FROM graph_decorations')) {
        return Promise.resolve({
          rows: [
            {
              id: 'frame-1',
              kind: 'frame',
              position_x: 10,
              position_y: 20,
              width: 300,
              height: 200,
              text_content: null,
              color: '#fff',
              font_size: null,
              font_family: null,
              font_weight: null,
              font_style: null,
              sort_order: 0,
            },
            {
              id: 'text-1',
              kind: 'text',
              position_x: 30,
              position_y: 40,
              width: null,
              height: null,
              text_content: 'Act one',
              color: '#111',
              font_size: 24,
              font_family: 'serif',
              font_weight: 'bold',
              font_style: 'italic',
              sort_order: 1,
            },
          ],
        });
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(
      readStoryEditorContextPage(client, {
        storyId: 'story-1',
        revision: 7,
        page: 1,
        pageSize: 4,
      }),
    ).resolves.toEqual({
      revision: 7,
      page: 1,
      pageSize: 4,
      hasMore: false,
      locations: [
        {
          id: 'location-1',
          name: 'Harbor',
          description: 'Harbor description',
          category: 'Coast',
          imageUrl: 'harbor.png',
        },
        { id: 'location-2', name: 'Street', description: 'Street description' },
      ],
      characters: [
        {
          id: 'character-1',
          name: 'Mira',
          description: 'Mira description',
          category: 'Allies',
          imageUrl: 'mira.png',
          isPlayable: true,
        },
        { id: 'character-2', name: 'Noah', description: 'Noah description' },
      ],
      statDefinitions: [
        {
          id: 'definition-1',
          name: 'Courage',
          valueType: 'number',
          category: 'Mind',
          imageUrl: 'courage.png',
          changePerHour: 2,
        },
        { id: 'definition-2', name: 'Alarm', valueType: 'boolean' },
      ],
      statAssignments: [
        {
          id: 'story-stat',
          statDefinitionId: 'definition-1',
          initialValue: 1,
          ownerType: 'story',
        },
        {
          id: 'character-stat',
          statDefinitionId: 'definition-1',
          initialValue: 1,
          ownerType: 'character',
          ownerId: 'character-1',
        },
        {
          id: 'location-stat',
          statDefinitionId: 'definition-1',
          initialValue: 1,
          ownerType: 'location',
          ownerId: 'location-1',
        },
        {
          id: 'item-stat',
          statDefinitionId: 'definition-1',
          initialValue: 1,
          ownerType: 'itemDefinition',
          ownerId: 'definition-item-1',
        },
      ],
      itemDefinitions: [
        {
          id: 'definition-item-1',
          name: 'Coat',
          description: 'Coat description',
          category: 'Clothing',
          imageUrl: 'coat.png',
        },
        { id: 'definition-item-2', name: 'Key', description: 'Key description' },
      ],
      itemInstances: [
        {
          id: 'item-1',
          itemDefinitionId: 'definition-item-1',
          ownerType: 'character',
          ownerId: 'character-1',
        },
        {
          id: 'item-2',
          itemDefinitionId: 'definition-item-1',
          ownerType: 'location',
          ownerId: 'location-1',
        },
        {
          id: 'item-3',
          itemDefinitionId: 'definition-item-1',
          parentItemId: 'item-1',
          relationshipType: 'worn',
          slotKey: 'torso',
        },
        { id: 'item-4', itemDefinitionId: 'definition-item-1' },
      ],
      graphDecorations: [
        {
          id: 'frame-1',
          kind: 'frame',
          position: { x: 10, y: 20 },
          color: '#fff',
          width: 300,
          height: 200,
        },
        {
          id: 'text-1',
          kind: 'text',
          position: { x: 30, y: 40 },
          color: '#111',
          text: 'Act one',
          fontSize: 24,
          fontFamily: 'serif',
          fontWeight: 'bold',
          fontStyle: 'italic',
        },
      ],
    });

    expect(query).toHaveBeenCalledTimes(7);
    expect(query.mock.calls[0][1]).toEqual(['story-1', 5, 0]);
  });

  it('can omit graph decorations from a context page', async () => {
    query.mockResolvedValue({ rows: [] });

    const result = await readStoryEditorContextPage(
      client,
      { storyId: 'story-1', revision: 1, page: 1, pageSize: 10 },
      false,
    );

    expect(result.hasMore).toBe(false);
    expect(result.graphDecorations).toEqual([]);
    expect(query).toHaveBeenCalledTimes(6);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('graph_decorations'))).toBe(false);
  });

  it('maps interaction and trigger structure pages', async () => {
    query
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'interaction-1',
            title: 'Opening',
            position_x: 10,
            position_y: 20,
            location_id: 'location-1',
            sort_order: 0,
          },
          {
            id: 'interaction-2',
            title: 'Next',
            position_x: 30,
            position_y: 40,
            location_id: null,
            sort_order: 1,
          },
          {
            id: 'interaction-lookahead',
            title: 'Lookahead',
            position_x: 50,
            position_y: 60,
            location_id: null,
            sort_order: 2,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'trigger-1',
            output_interaction_id: 'interaction-2',
            position_x: 25,
            position_y: 30,
            interaction_sort_order: 1,
            sort_order: 0,
          },
          {
            id: 'trigger-2',
            output_interaction_id: 'interaction-2',
            position_x: 50,
            position_y: null,
            interaction_sort_order: 1,
            sort_order: 1,
          },
          {
            id: 'trigger-lookahead',
            output_interaction_id: 'interaction-lookahead',
            position_x: 70,
            position_y: 80,
            interaction_sort_order: 2,
            sort_order: 0,
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { trigger_id: 'trigger-1', input_interaction_id: 'interaction-1', sort_order: 0 },
          { trigger_id: 'trigger-1', input_interaction_id: 'interaction-3', sort_order: 1 },
        ],
      });

    await expect(
      readStoryEditorInteractionPage(client, {
        storyId: 'story-1',
        revision: 4,
        page: 1,
        pageSize: 2,
      }),
    ).resolves.toEqual({
      revision: 4,
      page: 1,
      pageSize: 2,
      hasMore: true,
      interactions: [
        {
          id: 'interaction-1',
          title: 'Opening',
          position: { x: 10, y: 20 },
          locationId: 'location-1',
        },
        {
          id: 'interaction-2',
          title: 'Next',
          position: { x: 30, y: 40 },
          locationId: null,
        },
      ],
    });
    await expect(
      readStoryEditorTriggerPage(client, {
        storyId: 'story-1',
        revision: 4,
        page: 1,
        pageSize: 2,
      }),
    ).resolves.toEqual({
      revision: 4,
      page: 1,
      pageSize: 2,
      hasMore: true,
      triggers: [
        {
          id: 'trigger-1',
          outputInteractionId: 'interaction-2',
          inputInteractionIds: ['interaction-1', 'interaction-3'],
          position: { x: 25, y: 30 },
        },
        {
          id: 'trigger-2',
          outputInteractionId: 'interaction-2',
          inputInteractionIds: [],
        },
      ],
    });
  });

  it('does not announce a seventh page when page six is exactly full', async () => {
    query.mockResolvedValueOnce({
      rows: Array.from({ length: 100 }, (_, index) => ({
        id: `interaction-${index + 501}`,
        title: `Interaction ${index + 501}`,
        position_x: index,
        position_y: index,
        location_id: null,
        sort_order: index + 500,
      })),
    });

    const result = await readStoryEditorInteractionPage(client, {
      storyId: 'story-1',
      revision: 4,
      page: 6,
      pageSize: 100,
    });

    expect(result.interactions).toHaveLength(100);
    expect(result.hasMore).toBe(false);
    expect(query).toHaveBeenCalledWith(expect.any(String), ['story-1', 101, 500]);
  });

  it('does not query trigger inputs for an empty trigger page', async () => {
    query.mockResolvedValue({ rows: [] });

    const result = await readStoryEditorTriggerPage(client, {
      storyId: 'story-1',
      revision: 1,
      page: 1,
      pageSize: 10,
    });

    expect(result.triggers).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('maps interaction and trigger content pages', async () => {
    query.mockImplementation((sql: string) => {
      if (sql.includes('FROM interactions WHERE story_id')) {
        return Promise.resolve({
          rows: [
            {
              id: 'interaction-1',
              body: '<p>Opening</p>',
              duration_minutes: 15,
              conditional_text_blocks: [],
              sort_order: 0,
            },
            {
              id: 'interaction-lookahead',
              body: '<p>Deferred</p>',
              duration_minutes: 0,
              conditional_text_blocks: [],
              sort_order: 1,
            },
          ],
        });
      }
      if (sql.includes('FROM interaction_characters')) {
        return Promise.resolve({
          rows: [{ interaction_id: 'interaction-1', character_id: 'character-1', sort_order: 0 }],
        });
      }
      if (sql.includes('FROM interaction_stat_effects')) {
        return Promise.resolve({
          rows: [
            {
              interaction_id: 'interaction-1',
              stat_id: 'stat-1',
              item_id: null,
              operation: 'add',
              value: 2,
              sort_order: 0,
            },
            {
              interaction_id: 'interaction-1',
              stat_id: 'stat-2',
              item_id: 'item-1',
              operation: 'set',
              value: 5,
              sort_order: 1,
            },
          ],
        });
      }
      if (sql.includes('FROM interaction_item_effects')) {
        return Promise.resolve({
          rows: [
            {
              interaction_id: 'interaction-1',
              item_id: 'item-1',
              item_definition_id: 'definition-item-1',
              character_id: 'character-1',
              operation: 'obtain',
              sort_order: 0,
            },
            {
              interaction_id: 'interaction-1',
              item_id: null,
              item_definition_id: null,
              character_id: null,
              operation: 'lose',
              sort_order: 1,
            },
          ],
        });
      }
      if (sql.includes('FROM triggers')) {
        return Promise.resolve({
          rows: [
            {
              id: 'trigger-1',
              condition_groups: [{ id: 'group-1', conditions: [] }],
              appearance_probability: 60,
              timer_seconds: 12,
              interaction_sort_order: 0,
              sort_order: 0,
            },
            {
              id: 'trigger-lookahead',
              condition_groups: [],
              appearance_probability: 100,
              timer_seconds: null,
              interaction_sort_order: 1,
              sort_order: 0,
            },
          ],
        });
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(
      readStoryEditorInteractionContentPage(client, {
        storyId: 'story-1',
        revision: 8,
        page: 1,
        pageSize: 1,
      }),
    ).resolves.toEqual({
      revision: 8,
      page: 1,
      pageSize: 1,
      hasMore: true,
      interactions: [
        {
          interactionId: 'interaction-1',
          body: '<p>Opening</p>',
          durationMinutes: 15,
          conditionalTextBlocks: [],
          characterIds: ['character-1'],
          statEffects: [
            { statId: 'stat-1', operation: 'add', value: 2 },
            { statId: 'stat-2', itemId: 'item-1', operation: 'set', value: 5 },
          ],
          itemEffects: [
            {
              itemId: 'item-1',
              itemDefinitionId: 'definition-item-1',
              characterId: 'character-1',
              operation: 'obtain',
            },
            { operation: 'lose' },
          ],
        },
      ],
    });
    await expect(
      readStoryEditorTriggerContentPage(client, {
        storyId: 'story-1',
        revision: 8,
        page: 1,
        pageSize: 1,
      }),
    ).resolves.toEqual({
      revision: 8,
      page: 1,
      pageSize: 1,
      hasMore: true,
      triggers: [
        {
          triggerId: 'trigger-1',
          conditionGroups: [{ id: 'group-1', conditions: [] }],
          appearanceProbability: 60,
          timerSeconds: 12,
        },
      ],
    });
  });

  it('does not query related interaction content for an empty page', async () => {
    query.mockResolvedValue({ rows: [] });

    const result = await readStoryEditorInteractionContentPage(client, {
      storyId: 'story-1',
      revision: 2,
      page: 1,
      pageSize: 10,
    });

    expect(result.interactions).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });
});

function contextRow(id: string, name: string, category = '', image_url = '') {
  return {
    id,
    name,
    description: `${name} description`,
    category,
    image_url,
    sort_order: 0,
  };
}

function assignmentRow(
  id: string,
  owner_type: 'story' | 'character' | 'location' | 'item_definition',
  owner: Partial<{
    character_id: string;
    location_id: string;
    item_definition_id: string;
  }> = {},
) {
  return {
    id,
    stat_definition_id: 'definition-1',
    owner_type,
    character_id: owner.character_id ?? null,
    location_id: owner.location_id ?? null,
    item_definition_id: owner.item_definition_id ?? null,
    initial_value: 1,
    sort_order: 0,
  };
}

function itemRow(
  id: string,
  overrides: Partial<{
    owner_character_id: string;
    owner_location_id: string;
    parent_item_id: string;
    relationship_type: 'worn';
    slot_key: string;
  }> = {},
) {
  return {
    id,
    owner_character_id: overrides.owner_character_id ?? null,
    owner_location_id: overrides.owner_location_id ?? null,
    item_definition_id: 'definition-item-1',
    parent_item_id: overrides.parent_item_id ?? null,
    relationship_type: overrides.relationship_type ?? null,
    slot_key: overrides.slot_key ?? null,
    sort_order: 0,
  };
}
