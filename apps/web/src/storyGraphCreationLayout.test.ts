import { describe, expect, it } from 'vitest';
import { getNextChildPosition, type Story } from '@paralleax/shared';
import { interactionNodeHeight, interactionNodeWidth } from './storyGraph';
import { getStoryGraphClickCreationPosition } from './storyGraphCreationLayout';

const story: Story = {
  id: 'creation-layout',
  title: 'Creation layout',
  createdAt: '2026-08-21T08:00:00.000Z',
  updatedAt: '2026-08-21T08:00:00.000Z',
  interactions: [
    {
      id: 'root',
      title: 'Root',
      body: '',
      position: { x: 80, y: 120 },
      triggers: [{ id: 'root-trigger', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'child',
      title: 'Existing child',
      body: '',
      position: { x: 80, y: 496 },
      triggers: [{ id: 'child-trigger', inputInteractionIds: ['root'], conditions: [] }],
    },
  ],
};

describe('story graph click creation layout', () => {
  it('places a clicked child with the scoped graph layout instead of the legacy next slot', () => {
    const position = getStoryGraphClickCreationPosition(story, {
      kind: 'child',
      sourceId: 'root',
    });

    expect(position).toBeDefined();
    expect(position).not.toEqual(getNextChildPosition(story, story.interactions[0]));
    expect(position!.y).toBeGreaterThan(story.interactions[0].position.y);
    expectOverlapsNoInteraction(position!);
  });

  it('places a clicked parent above its target without overlapping an existing interaction', () => {
    const position = getStoryGraphClickCreationPosition(story, {
      kind: 'parent',
      targetId: 'child',
    });

    expect(position).toBeDefined();
    expect(position!.y).toBeLessThan(story.interactions[1].position.y);
    expectOverlapsNoInteraction(position!);
  });

  it('places a clicked root in collision-free graph space deterministically', () => {
    const first = getStoryGraphClickCreationPosition(story, { kind: 'root' });
    const second = getStoryGraphClickCreationPosition(story, { kind: 'root' });

    expect(first).toEqual(second);
    expect(first).toBeDefined();
    expectOverlapsNoInteraction(first!);
  });

  it('ignores a click creation whose referenced interaction no longer exists', () => {
    expect(
      getStoryGraphClickCreationPosition(story, { kind: 'child', sourceId: 'missing' }),
    ).toBeUndefined();
    expect(
      getStoryGraphClickCreationPosition(story, { kind: 'parent', targetId: 'missing' }),
    ).toBeUndefined();
  });

  it('supports legacy interactions without a stored graph position', () => {
    const legacyStory = structuredClone(story);
    delete (legacyStory.interactions[1] as Partial<(typeof story.interactions)[number]>).position;

    const position = getStoryGraphClickCreationPosition(legacyStory, {
      kind: 'child',
      sourceId: 'child',
    });

    expect(position).toEqual({
      x: expect.any(Number),
      y: expect.any(Number),
    });
  });
});

function expectOverlapsNoInteraction(position: { x: number; y: number }) {
  story.interactions.forEach((interaction) => {
    const overlaps = !(
      position.x + interactionNodeWidth <= interaction.position.x ||
      interaction.position.x + interactionNodeWidth <= position.x ||
      position.y + interactionNodeHeight <= interaction.position.y ||
      interaction.position.y + interactionNodeHeight <= position.y
    );
    expect(overlaps, `overlaps ${interaction.id}`).toBe(false);
  });
}
