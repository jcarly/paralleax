import { ConflictException } from '@nestjs/common';
import type { Story } from '@paralleax/shared';
import type { StoryMutationService } from './story-mutations';
import { StoryGraphService } from './story-graph';

describe('StoryGraphService', () => {
  const mutations = { update: jest.fn() };
  const service = new StoryGraphService(mutations as unknown as StoryMutationService);

  beforeEach(() => {
    jest.clearAllMocks();
    mutations.update.mockImplementation(
      async (_storyId: string, mutation: (story: Story) => Story, _userId: string) => {
        const story = mutation(storyFixture());
        story.revision = 4;
        story.updatedAt = '2026-08-25T16:00:00.000Z';
        return story;
      },
    );
  });

  it('creates a linked interaction and returns only the compact mutation result', async () => {
    const result = await service.createInteraction(
      'story-1',
      { parentId: 'root', position: { x: 320, y: 480 } },
      'user-1',
    );

    expect(result).toMatchObject({
      revision: 4,
      updatedAt: '2026-08-25T16:00:00.000Z',
      interaction: {
        title: '',
        position: { x: 320, y: 480 },
        triggers: [
          {
            inputInteractionIds: ['root'],
            conditionGroups: [{ conditions: [] }],
            appearanceProbability: 100,
          },
        ],
      },
    });
    expect(result).not.toHaveProperty('interactions');
    expect(mutations.update).toHaveBeenCalledWith(
      'story-1',
      expect.any(Function),
      'user-1',
      'interaction.created',
    );
  });

  it('rejects interaction references from another story', async () => {
    await expect(
      service.updateInteraction('story-1', 'child', { locationId: 'foreign-location' }, 'user-1'),
    ).rejects.toThrow('Interaction location must belong to the same story');
  });

  it('resolves author variable references while saving interaction content', async () => {
    const result = await service.updateInteraction(
      'story-1',
      'child',
      { body: '<p>Energy: {{Mira.Energy}} / {{Unknown.Energy}}</p>' },
      'user-1',
    );

    expect(result.interaction.body).toBe(
      '<p>Energy: <span contenteditable="false" data-stat-value="mira-energy">' +
        '{{Mira.Energy}}</span> / ' +
        '{{Unknown.Energy}}</p>',
    );
  });

  it('stores conditional text with the same validated conditions as Triggers', async () => {
    const result = await service.updateInteraction(
      'story-1',
      'child',
      {
        body: '<div data-conditional-text-block="clue"><p>Clue</p></div>',
        conditionalTextBlocks: [
          {
            id: 'clue',
            conditions: [{ interactionId: 'root', hasBeenVisited: true }],
          },
        ],
      },
      'user-1',
    );

    expect(result.interaction).toMatchObject({
      body: '<div data-conditional-text-block="clue"><p>Clue</p></div>',
      conditionalTextBlocks: [
        {
          id: 'clue',
          conditions: [{ interactionId: 'root', hasBeenVisited: true }],
        },
      ],
    });
  });

  it('rejects conditional text references from another Story', async () => {
    await expect(
      service.updateInteraction(
        'story-1',
        'child',
        {
          conditionalTextBlocks: [
            {
              id: 'clue',
              conditions: [{ interactionId: 'foreign', hasBeenVisited: true }],
            },
          ],
        },
        'user-1',
      ),
    ).rejects.toThrow('Condition references must belong to the same story');
  });

  it('normalizes trigger inputs and temporal condition collections', async () => {
    const result = await service.addTrigger(
      'story-1',
      'root',
      {
        inputInteractionIds: ['child', 'child'],
        conditions: [
          {
            temporal: {
              dates: ['2026-08-25', '2026-08-25'],
              weekdays: ['monday', 'monday'],
            },
          },
        ],
      },
      'user-1',
    );

    expect(result).toMatchObject({
      interactionId: 'root',
      trigger: {
        inputInteractionIds: ['child'],
        conditionGroups: [
          {
            conditions: [
              {
                temporal: {
                  dates: ['2026-08-25'],
                  weekdays: ['monday'],
                  dateRanges: [],
                  timeSlots: [],
                },
              },
            ],
          },
        ],
        appearanceProbability: 100,
      },
      revision: 4,
    });
  });

  it('rejects adding a source → target pair already owned by another Trigger', async () => {
    let caught: unknown;
    try {
      await service.addTrigger('story-1', 'child', { inputInteractionIds: ['root'] }, 'user-1');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getStatus()).toBe(409);
    expect((caught as ConflictException).getResponse()).toMatchObject({
      code: 'TRIGGER_CONNECTION_EXISTS',
    });
  });

  it('allows a reverse route, new sources on a Trigger, and different-source routes', async () => {
    mutations.update.mockImplementationOnce(
      async (_storyId: string, mutation: (story: Story) => Story) => {
        const story = storyFixture();
        story.interactions.push({
          id: 'other-source',
          title: 'Other source',
          body: '',
          position: { x: 120, y: 0 },
          triggers: [{ id: 'other-root', inputInteractionIds: [], conditions: [] }],
        });
        return mutation(story);
      },
    );
    const addedInput = await service.updateTrigger(
      'story-1',
      'child',
      'child-trigger',
      { inputInteractionIds: ['root', 'other-source'] },
      'user-1',
    );
    expect(addedInput.trigger.inputInteractionIds).toEqual(['root', 'other-source']);

    mutations.update.mockImplementationOnce(
      async (_storyId: string, mutation: (story: Story) => Story) => {
        const story = storyFixture();
        story.interactions.push({
          id: 'other-source',
          title: 'Other source',
          body: '',
          position: { x: 120, y: 0 },
          triggers: [{ id: 'other-root', inputInteractionIds: [], conditions: [] }],
        });
        return mutation(story);
      },
    );
    const separateRoute = await service.addTrigger(
      'story-1',
      'child',
      { inputInteractionIds: ['other-source'] },
      'user-1',
    );
    expect(separateRoute.trigger.inputInteractionIds).toEqual(['other-source']);

    const reverseRoute = await service.addTrigger(
      'story-1',
      'root',
      { inputInteractionIds: ['child'] },
      'user-1',
    );
    expect(reverseRoute.trigger.inputInteractionIds).toEqual(['child']);
  });

  it('rejects adding a duplicate source through an existing Trigger update', async () => {
    mutations.update.mockImplementationOnce(
      async (_storyId: string, mutation: (story: Story) => Story) => {
        const story = storyFixture();
        story.interactions.push({
          id: 'other-source',
          title: 'Other source',
          body: '',
          position: { x: 120, y: 0 },
          triggers: [{ id: 'other-root', inputInteractionIds: [], conditions: [] }],
        });
        story.interactions[1].triggers.push({
          id: 'other-child-trigger',
          inputInteractionIds: ['other-source'],
          conditions: [],
        });
        return mutation(story);
      },
    );

    await expect(
      service.updateTrigger(
        'story-1',
        'child',
        'other-child-trigger',
        { inputInteractionIds: ['root'] },
        'user-1',
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'TRIGGER_CONNECTION_EXISTS' },
    });
  });

  it('allows editing and preserving an existing duplicate in a historical Story', async () => {
    mutations.update.mockImplementationOnce(
      async (_storyId: string, mutation: (story: Story) => Story) => {
        const story = storyFixture();
        story.interactions[1].triggers.push({
          id: 'legacy-duplicate',
          inputInteractionIds: ['root'],
          conditions: [],
        });
        return mutation(story);
      },
    );
    const edited = await service.updateTrigger(
      'story-1',
      'child',
      'child-trigger',
      { inputInteractionIds: ['root'], appearanceProbability: 70 },
      'user-1',
    );

    expect(edited.trigger).toMatchObject({
      inputInteractionIds: ['root'],
      appearanceProbability: 70,
    });
  });

  it('allows updating conditions and deleting a route on a historical duplicate Story', async () => {
    mutations.update.mockImplementationOnce(
      async (_storyId: string, mutation: (story: Story) => Story) => {
        const story = storyFixture();
        story.interactions[1].triggers.push({
          id: 'legacy-duplicate',
          inputInteractionIds: ['root'],
          conditions: [],
        });
        return mutation(story);
      },
    );
    const edited = await service.updateTrigger(
      'story-1',
      'child',
      'child-trigger',
      { appearanceProbability: 65 },
      'user-1',
    );
    expect(edited.trigger.appearanceProbability).toBe(65);

    mutations.update.mockImplementationOnce(
      async (_storyId: string, mutation: (story: Story) => Story) => {
        const story = storyFixture();
        story.interactions[1].triggers.push({
          id: 'legacy-duplicate',
          inputInteractionIds: ['root'],
          conditions: [],
        });
        return mutation(story);
      },
    );
    const deleted = await service.deleteTrigger('story-1', 'child', 'child-trigger', 'user-1');
    expect(deleted.triggerRemoved).toBe(true);
  });

  it('stores condition groups, probability, and a nullable Trigger timer', async () => {
    const result = await service.updateTrigger(
      'story-1',
      'child',
      'child-trigger',
      {
        conditionGroups: [
          { id: 'visited', conditions: [{ interactionId: 'root', hasBeenVisited: true }] },
          { id: 'fallback', conditions: [] },
        ],
        appearanceProbability: 35,
        timerSeconds: 0,
      },
      'user-1',
    );

    expect(result.trigger).toMatchObject({
      conditionGroups: [
        { id: 'visited', conditions: [{ interactionId: 'root', hasBeenVisited: true }] },
        { id: 'fallback', conditions: [] },
      ],
      appearanceProbability: 35,
      timerSeconds: 0,
    });
    expect(result.trigger).not.toHaveProperty('conditions');

    const cleared = await service.updateTrigger(
      'story-1',
      'child',
      'child-trigger',
      { timerSeconds: null },
      'user-1',
    );
    expect(cleared.trigger.timerSeconds).toBeNull();
  });

  it('stores a typed stat comparison with another same-Story stat', async () => {
    const result = await service.updateTrigger(
      'story-1',
      'child',
      'child-trigger',
      {
        conditionGroups: [
          {
            id: 'energy-check',
            conditions: [
              {
                statId: 'energy',
                operator: 'gte',
                comparisonStatId: 'mira-energy',
              },
            ],
          },
        ],
      },
      'user-1',
    );

    expect(result.trigger.conditionGroups).toEqual([
      {
        id: 'energy-check',
        conditions: [{ statId: 'energy', operator: 'gte', comparisonStatId: 'mira-energy' }],
      },
    ]);
  });

  it('stores a validated typed expression comparison', async () => {
    const result = await service.updateTrigger(
      'story-1',
      'child',
      'child-trigger',
      {
        conditionGroups: [
          {
            id: 'energy-expression',
            conditions: [
              {
                statId: 'energy',
                operator: 'gte',
                expression: '(@{mira-energy} + 2) * 3',
              },
            ],
          },
        ],
      },
      'user-1',
    );

    expect(result.trigger.conditionGroups).toEqual([
      {
        id: 'energy-expression',
        conditions: [
          {
            statId: 'energy',
            operator: 'gte',
            expression: '(@{mira-energy} + 2) * 3',
          },
        ],
      },
    ]);
  });

  it('creates graph decorations through the existing decoration builder', async () => {
    const result = await service.createGraphDecoration(
      'story-1',
      { kind: 'frame', position: { x: 10, y: 20 } },
      'user-1',
    );

    expect(result).toMatchObject({
      decoration: {
        kind: 'frame',
        position: { x: 10, y: 20 },
        color: '#5b6ee1',
        width: 420,
        height: 240,
      },
      revision: 4,
    });
  });

  it('persists a graph position gesture through one Story mutation', async () => {
    const result = await service.updatePositions(
      'story-1',
      {
        interactionUpdates: [{ interactionId: 'root', position: { x: 200, y: 300 } }],
        triggerUpdates: [
          {
            interactionId: 'child',
            triggerIds: ['child-trigger'],
            position: { x: 210, y: 220 },
          },
        ],
      },
      'user-1',
    );

    expect(result).toEqual({ revision: 4, updatedAt: '2026-08-25T16:00:00.000Z' });
    expect(mutations.update).toHaveBeenCalledTimes(1);
    const mutation = mutations.update.mock.calls[0][1] as (story: Story) => Story;
    const updated = mutation(storyFixture());
    expect(updated.interactions[0].position).toEqual({ x: 200, y: 300 });
    expect(updated.interactions[1].triggers[0].position).toEqual({ x: 210, y: 220 });
  });

  it('returns compact cleanup results for graph deletions', async () => {
    await expect(service.deleteInteraction('story-1', 'child', 'user-1')).resolves.toEqual({
      interactionId: 'child',
      revision: 4,
      updatedAt: '2026-08-25T16:00:00.000Z',
    });
    await expect(service.deleteGraphDecoration('story-1', 'frame', 'user-1')).rejects.toThrow(
      'Graph decoration not found',
    );

    const story = storyFixture();
    story.graphDecorations = [
      {
        id: 'frame',
        kind: 'frame',
        position: { x: 0, y: 0 },
        color: '#5b6ee1',
        width: 420,
        height: 240,
      },
    ];
    mutations.update.mockImplementationOnce(
      async (_storyId: string, mutation: (value: Story) => Story) => {
        const updated = mutation(story);
        updated.revision = 5;
        updated.updatedAt = '2026-08-25T17:00:00.000Z';
        return updated;
      },
    );
    await expect(service.deleteGraphDecoration('story-1', 'frame', 'user-1')).resolves.toEqual({
      decorationId: 'frame',
      revision: 5,
      updatedAt: '2026-08-25T17:00:00.000Z',
    });

    await expect(
      service.deleteTrigger('story-1', 'child', 'child-trigger', 'user-1'),
    ).resolves.toEqual({
      interactionId: 'child',
      triggerId: 'child-trigger',
      triggerRemoved: false,
      revision: 4,
      updatedAt: '2026-08-25T16:00:00.000Z',
    });
  });
});

function storyFixture(): Story {
  return {
    id: 'story-1',
    revision: 3,
    title: 'Story',
    createdAt: '2026-08-25T08:00:00.000Z',
    updatedAt: '2026-08-25T08:00:00.000Z',
    locations: [{ id: 'harbor', name: 'Harbor', description: '' }],
    characters: [
      {
        id: 'mira',
        name: 'Mira',
        description: '',
        stats: [{ id: 'mira-energy', statDefinitionId: 'energy-definition', initialValue: 5 }],
        items: [],
      },
    ],
    statDefinitions: [{ id: 'energy-definition', name: 'Energy', valueType: 'number' }],
    stats: [{ id: 'energy', statDefinitionId: 'energy-definition', initialValue: 5 }],
    itemDefinitions: [{ id: 'key-definition', name: 'Key', description: '' }],
    graphDecorations: [],
    interactions: [
      {
        id: 'root',
        title: 'Root',
        body: '',
        position: { x: 0, y: 0 },
        triggers: [{ id: 'root-trigger', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'child',
        title: 'Child',
        body: '',
        position: { x: 0, y: 200 },
        triggers: [{ id: 'child-trigger', inputInteractionIds: ['root'], conditions: [] }],
      },
    ],
  };
}
