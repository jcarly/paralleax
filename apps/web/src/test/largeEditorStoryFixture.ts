import type { Story } from '@paralleax/shared';

interface LargeEditorStoryOptions {
  columns?: number;
  contextCount?: number;
}

export function createLargeEditorStoryFixture(
  interactionCount: number,
  options: LargeEditorStoryOptions = {},
): Story {
  const columns = positiveInteger(options.columns, 20);
  const contextCount = positiveInteger(options.contextCount, 20);
  const now = '2026-09-11T08:00:00.000Z';
  return {
    id: 'story-1',
    revision: 1,
    title: `Large editor story with ${interactionCount} interactions`,
    access: { visibility: 'private', editPolicy: 'owner', commentPolicy: 'editors' },
    capabilities: { canRead: true, canEdit: true, canManage: true, canComment: false },
    createdAt: now,
    updatedAt: now,
    locations: Array.from({ length: contextCount }, (_, index) => ({
      id: `location-${index}`,
      name: `Location ${index}`,
      description: `Description for location ${index}.`,
    })),
    characters: Array.from({ length: contextCount }, (_, index) => ({
      id: `character-${index}`,
      name: `Character ${index}`,
      description: `Description for character ${index}.`,
      isPlayable: index === 0,
      stats: [],
      items: [],
    })),
    interactions: Array.from({ length: interactionCount }, (_, index) => ({
      id: `interaction-${index}`,
      title: `Interaction ${index}`,
      body: `<p>${`Narrative content for interaction ${index}. `.repeat(8)}</p>`,
      position: {
        x: (index % columns) * 240 + 80,
        y: Math.floor(index / columns) * 150 + 80,
      },
      locationId: `location-${index % contextCount}`,
      characterIds: [`character-${index % contextCount}`],
      triggers:
        index === 0
          ? [{ id: 'trigger-0', inputInteractionIds: [], conditions: [] }]
          : [
              {
                id: `trigger-${index}`,
                inputInteractionIds: [`interaction-${index - 1}`],
                conditions:
                  index % 10 === 0
                    ? [
                        {
                          interactionId: `interaction-${index - 1}`,
                          hasBeenVisited: true,
                        },
                      ]
                    : [],
              },
            ],
    })),
  };
}

function positiveInteger(value: number | undefined, fallback: number) {
  return Number.isInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}
