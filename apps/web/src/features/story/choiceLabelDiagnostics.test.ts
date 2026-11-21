import { describe, expect, it } from 'vitest';
import type { Story } from '@paralleax/shared';
import { getInteractionsNeedingChoiceLabel, getOptionDestinations } from './choiceLabelDiagnostics';

function interaction(id: string, title: string, inputs: string[]) {
  return {
    id,
    title,
    body: '',
    position: { x: 0, y: 0 },
    triggers: [{ id: `trigger-${id}`, inputInteractionIds: inputs, conditions: [] }],
  };
}

const story: Pick<Story, 'interactions'> = {
  interactions: [
    interaction('start', '', []),
    interaction('left', '', ['start']),
    interaction('right', 'Go right', ['start']),
    interaction('after', '', ['right']),
  ],
};

describe('choice label diagnostics', () => {
  it('lists the choices offered after an Interaction', () => {
    expect(getOptionDestinations(story, 'start').map(({ id }) => id)).toEqual(['left', 'right']);
  });

  it('flags only untitled choices among several', () => {
    // `after` is the only choice after `right` (reads Continue); `start` is a root.
    expect([...getInteractionsNeedingChoiceLabel(story)]).toEqual(['left']);
  });
});
