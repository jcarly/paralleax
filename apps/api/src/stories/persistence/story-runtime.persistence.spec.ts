import type { Queryable } from './stories.persistence.types';
import { readStoryRuntimeSlice } from './story-runtime.persistence';

describe('Story runtime persistence projection', () => {
  const query = jest.fn();
  const client = { query } as unknown as Queryable;

  beforeEach(() => query.mockReset());

  it('maps journey interactions, paginated options, triggers, effects, and references', async () => {
    query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT output.id')) {
        return Promise.resolve({ rows: [{ id: 'option-1', sort_order: 1, total_count: '3' }] });
      }
      if (sql.includes('SELECT triggers.id')) {
        return Promise.resolve({
          rows: [
            {
              id: 'trigger-1',
              output_interaction_id: 'option-1',
              position_x: 30,
              position_y: 40,
              condition_groups: [
                {
                  id: 'group-1',
                  conditions: [{ interactionId: 'referenced-1', hasBeenVisited: true }],
                },
              ],
              appearance_probability: 75,
              timer_seconds: 10,
              sort_order: 0,
            },
            {
              id: 'trigger-2',
              output_interaction_id: 'option-1',
              position_x: null,
              position_y: null,
              condition_groups: [{ id: 'group-2', conditions: [] }],
              appearance_probability: 100,
              timer_seconds: null,
              sort_order: 1,
            },
          ],
        });
      }
      if (sql.includes('FROM trigger_inputs')) {
        return Promise.resolve({
          rows: [
            { trigger_id: 'trigger-1', input_interaction_id: 'current-1', sort_order: 0 },
            { trigger_id: 'trigger-1', input_interaction_id: 'previous-1', sort_order: 1 },
          ],
        });
      }
      if (sql.includes('FROM interaction_characters')) {
        return Promise.resolve({
          rows: [{ interaction_id: 'option-1', character_id: 'character-1', sort_order: 0 }],
        });
      }
      if (sql.includes('FROM interaction_stat_effects')) {
        return Promise.resolve({
          rows: [
            {
              interaction_id: 'option-1',
              stat_id: 'stat-1',
              item_id: null,
              operation: 'add',
              value: 2,
              sort_order: 0,
            },
            {
              interaction_id: 'option-1',
              stat_id: 'stat-2',
              item_id: 'item-1',
              operation: 'set',
              value: 4,
              sort_order: 1,
            },
          ],
        });
      }
      if (sql.includes('FROM interaction_item_effects')) {
        return Promise.resolve({
          rows: [
            {
              interaction_id: 'option-1',
              item_id: 'item-1',
              item_definition_id: 'definition-item-1',
              character_id: 'character-1',
              operation: 'obtain',
              sort_order: 0,
            },
            {
              interaction_id: 'option-1',
              item_id: null,
              item_definition_id: null,
              character_id: null,
              operation: 'lose',
              sort_order: 1,
            },
          ],
        });
      }
      if (sql.includes('SELECT id, title FROM interactions')) {
        return Promise.resolve({ rows: [{ id: 'referenced-1', title: 'Referenced scene' }] });
      }
      if (sql.includes('FROM interactions')) {
        return Promise.resolve({
          rows: [
            interactionRow('current-1', 'Current scene', 0),
            interactionRow('option-1', 'Available option', 1, 'location-1'),
          ],
        });
      }
      throw new Error(`Unexpected query: ${sql}`);
    });

    await expect(
      readStoryRuntimeSlice(client, {
        storyId: 'story-1',
        revision: 12,
        currentInteractionId: 'current-1',
        interactionIds: ['current-1', 'option-1'],
        page: 1,
        pageSize: 2,
      }),
    ).resolves.toEqual({
      revision: 12,
      page: 1,
      pageSize: 2,
      totalOptionCount: 3,
      hasMore: true,
      optionInteractionIds: ['option-1'],
      interactionReferences: [{ id: 'referenced-1', title: 'Referenced scene' }],
      interactions: [
        {
          id: 'current-1',
          title: 'Current scene',
          body: '<p>Current scene</p>',
          position: { x: 0, y: 10 },
          locationId: null,
          durationMinutes: 5,
          conditionalTextBlocks: [],
          characterIds: [],
          statEffects: [],
          itemEffects: [],
          triggers: [],
        },
        {
          id: 'option-1',
          title: 'Available option',
          body: '<p>Available option</p>',
          position: { x: 20, y: 30 },
          locationId: 'location-1',
          durationMinutes: 5,
          conditionalTextBlocks: [],
          characterIds: ['character-1'],
          statEffects: [
            { statId: 'stat-1', operation: 'add', value: 2 },
            { statId: 'stat-2', itemId: 'item-1', operation: 'set', value: 4 },
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
          triggers: [
            {
              id: 'trigger-1',
              inputInteractionIds: ['current-1', 'previous-1'],
              conditionGroups: [
                {
                  id: 'group-1',
                  conditions: [{ interactionId: 'referenced-1', hasBeenVisited: true }],
                },
              ],
              appearanceProbability: 75,
              timerSeconds: 10,
              position: { x: 30, y: 40 },
            },
            {
              id: 'trigger-2',
              inputInteractionIds: [],
              conditionGroups: [{ id: 'group-2', conditions: [] }],
              appearanceProbability: 100,
              timerSeconds: null,
            },
          ],
        },
      ],
    });
  });

  it('returns an empty slice without querying when options are disabled', async () => {
    await expect(
      readStoryRuntimeSlice(client, {
        storyId: 'story-1',
        revision: 2,
        interactionIds: [],
        includeOptions: false,
        page: 1,
        pageSize: 20,
      }),
    ).resolves.toEqual({
      revision: 2,
      page: 1,
      pageSize: 20,
      totalOptionCount: 0,
      hasMore: false,
      optionInteractionIds: [],
      interactionReferences: [],
      interactions: [],
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('loads journey content without option triggers', async () => {
    query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT output.id')) return Promise.resolve({ rows: [] });
      if (sql.includes('FROM interactions')) {
        return Promise.resolve({ rows: [interactionRow('journey-1', 'Journey scene', 0)] });
      }
      return Promise.resolve({ rows: [] });
    });

    const result = await readStoryRuntimeSlice(client, {
      storyId: 'story-1',
      revision: 3,
      currentInteractionId: null,
      interactionIds: ['journey-1'],
      page: 2,
      pageSize: 10,
    });

    expect(result.totalOptionCount).toBe(0);
    expect(result.hasMore).toBe(false);
    expect(result.optionInteractionIds).toEqual([]);
    expect(result.interactionReferences).toEqual([]);
    expect(result.interactions[0]).toMatchObject({ id: 'journey-1', triggers: [] });
    expect(query.mock.calls.some(([sql]) => String(sql).includes('SELECT triggers.id'))).toBe(
      false,
    );
    expect(
      query.mock.calls.some(([sql]) => String(sql).includes('SELECT trigger_inputs.trigger_id')),
    ).toBe(false);
  });
});

function interactionRow(
  id: string,
  title: string,
  sort_order: number,
  location_id: string | null = null,
) {
  return {
    id,
    title,
    body: `<p>${title}</p>`,
    position_x: sort_order * 20,
    position_y: sort_order * 20 + 10,
    location_id,
    duration_minutes: 5,
    conditional_text_blocks: [],
    sort_order,
  };
}
