import { describe, expect, it } from 'vitest';
import type { Story } from '@paralleax/shared';
import { buildInteractionNodes, buildTriggerNodes } from './storyGraph';
import {
  applyStoryGraphSelection,
  createStoryGraphSelection,
  getStoryGraphSelectionNodeIds,
  getStoryGraphSelectionTargets,
} from './storyGraphSelection';

const story: Story = {
  id: 'story-selection',
  title: 'Selection story',
  createdAt: '2026-08-22T08:00:00.000Z',
  updatedAt: '2026-08-22T08:00:00.000Z',
  interactions: [
    {
      id: 'source',
      title: 'Source',
      body: '',
      position: { x: 80, y: 120 },
      triggers: [{ id: 'root-trigger', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'target',
      title: 'Target',
      body: '',
      position: { x: 80, y: 360 },
      triggers: [{ id: 'linked-trigger', inputInteractionIds: ['source'], conditions: [] }],
    },
  ],
};

describe('story graph selection', () => {
  it('keeps interactions and grouped trigger markers as transient layout targets', () => {
    const interactionNodes = buildInteractionNodes(story, undefined);
    const triggerNode = buildTriggerNodes(story)[0];
    const selection = createStoryGraphSelection([interactionNodes[0], triggerNode]);

    expect(selection).toEqual({
      interactionIds: ['source'],
      triggers: [
        {
          nodeId: 'trigger:target:linked-trigger',
          interactionId: 'target',
          triggerId: 'linked-trigger',
          triggerIds: ['linked-trigger'],
        },
      ],
    });
    expect([...getStoryGraphSelectionNodeIds(selection)]).toEqual([
      'source',
      'trigger:target:linked-trigger',
    ]);
    expect(getStoryGraphSelectionTargets(selection)).toEqual([
      { type: 'interaction', interactionId: 'source' },
      { type: 'trigger', interactionId: 'target', triggerId: 'linked-trigger' },
    ]);
  });

  it('projects selection styling without changing unselected narrative nodes', () => {
    const nodes = [...buildInteractionNodes(story, undefined), ...buildTriggerNodes(story)];
    const selection = createStoryGraphSelection([nodes[0], nodes[2]]);
    const projected = applyStoryGraphSelection(nodes, selection);

    expect(projected.map(({ selected }) => selected)).toEqual([true, false, true]);
    expect(projected.map(({ data }) => data.selected)).toEqual([true, false, true]);
    expect(createStoryGraphSelection([])).toBeUndefined();
  });
});
