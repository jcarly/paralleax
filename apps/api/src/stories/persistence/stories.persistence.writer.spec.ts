import { createStoryChangeDelta, type Story } from '@paralleax/shared';
import type { Queryable } from './stories.persistence.types';
import { persistStoryDifference } from './stories.persistence.writer';

describe('Story difference persistence', () => {
  it('persists a graph-wide position change with two bulk graph updates', async () => {
    const before = graphStory(2_000);
    const after = structuredClone(before);
    after.revision = 2;
    after.updatedAt = '2026-08-29T10:00:00.000Z';
    for (const interaction of after.interactions) {
      interaction.position.x += 25;
      interaction.position.y += 50;
      const trigger = interaction.triggers[0];
      trigger.position = {
        x: (trigger.position?.x ?? 0) + 25,
        y: (trigger.position?.y ?? 0) + 50,
      };
    }
    const delta = createStoryChangeDelta(before, after)!;
    const query = jest.fn().mockResolvedValue({ rows: [], rowCount: 2_000 });

    await persistStoryDifference({ query } as unknown as Queryable, before, after, delta);

    expect(query).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE interactions AS target'), [
      expect.any(String),
      before.id,
    ]);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('UPDATE triggers AS target'), [
      expect.any(String),
      before.id,
    ]);
    const graphPayloads = query.mock.calls
      .filter(([sql]) => String(sql).includes('jsonb_to_recordset'))
      .map(([, values]) => JSON.parse(values[0] as string) as unknown[]);
    expect(graphPayloads.map((rows) => rows.length)).toEqual([2_000, 2_000]);
  });
});

function graphStory(interactionCount: number): Story {
  return {
    id: 'large-story',
    revision: 1,
    title: 'Large story',
    createdAt: '2026-08-29T08:00:00.000Z',
    updatedAt: '2026-08-29T08:00:00.000Z',
    interactions: Array.from({ length: interactionCount }, (_, index) => ({
      id: `interaction-${index}`,
      title: `Interaction ${index}`,
      body: '',
      position: { x: index * 10, y: index * 20 },
      triggers: [
        {
          id: `trigger-${index}`,
          inputInteractionIds: index === 0 ? [] : [`interaction-${index - 1}`],
          conditions: [],
          position: { x: index * 10, y: index * 20 - 50 },
        },
      ],
    })),
  };
}
