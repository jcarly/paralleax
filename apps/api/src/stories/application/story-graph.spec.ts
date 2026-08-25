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
        title: 'New interaction',
        position: { x: 320, y: 480 },
        triggers: [{ inputInteractionIds: ['root'], conditions: [] }],
      },
    });
    expect(result).not.toHaveProperty('interactions');
    expect(mutations.update).toHaveBeenCalledWith('story-1', expect.any(Function), 'user-1');
  });

  it('rejects interaction references from another story', async () => {
    await expect(
      service.updateInteraction('story-1', 'child', { locationId: 'foreign-location' }, 'user-1'),
    ).rejects.toThrow('Interaction location must belong to the same story');
  });

  it('normalizes trigger inputs and temporal condition collections', async () => {
    const result = await service.addTrigger(
      'story-1',
      'child',
      {
        inputInteractionIds: ['root', 'root'],
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
      interactionId: 'child',
      trigger: {
        inputInteractionIds: ['root'],
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
      revision: 4,
    });
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
});

function storyFixture(): Story {
  return {
    id: 'story-1',
    revision: 3,
    title: 'Story',
    createdAt: '2026-08-25T08:00:00.000Z',
    updatedAt: '2026-08-25T08:00:00.000Z',
    locations: [{ id: 'harbor', name: 'Harbor', description: '' }],
    characters: [{ id: 'mira', name: 'Mira', description: '', stats: [], items: [] }],
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
