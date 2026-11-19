import type { StoryChangeDelta } from '@paralleax/shared';
import { normalizeLegacyStoryHistoryDelta } from './story-history-compatibility';

function interactionsDelta(delta: StoryChangeDelta): StoryChangeDelta {
  return {
    kind: 'object',
    fields: {
      interactions: {
        kind: 'entities',
        entries: { 'interaction-1': { delta, before: { index: 0 }, after: { index: 0 } } },
      },
    },
  };
}

function locationDelta(locationId: StoryChangeDelta): StoryChangeDelta {
  return interactionsDelta({ kind: 'object', fields: { locationId } });
}

function locationChange(before: string | null, after: string | null): StoryChangeDelta {
  return locationDelta({ kind: 'value', beforeExists: true, before, afterExists: true, after });
}

it('reads a legacy cleared location as an absent field', () => {
  const legacy = locationChange('harbor', null);

  expect(normalizeLegacyStoryHistoryDelta(legacy)).toEqual(
    locationDelta({ kind: 'value', beforeExists: true, before: 'harbor', afterExists: false }),
  );
  expect(legacy).toEqual(locationChange('harbor', null));
});

it('reads a legacy missing previous location as an absent field', () => {
  expect(normalizeLegacyStoryHistoryDelta(locationChange(null, 'harbor'))).toEqual(
    locationDelta({ kind: 'value', beforeExists: false, afterExists: true, after: 'harbor' }),
  );
});

it('removes a null location from a whole created or deleted Interaction', () => {
  const deleted = interactionsDelta({
    kind: 'value',
    beforeExists: true,
    before: { id: 'interaction-1', title: 'Gone', locationId: null },
    afterExists: false,
  });

  expect(normalizeLegacyStoryHistoryDelta(deleted)).toEqual(
    interactionsDelta({
      kind: 'value',
      beforeExists: true,
      before: { id: 'interaction-1', title: 'Gone' },
      afterExists: false,
    }),
  );
});

it('keeps current-format and unrelated deltas unchanged', () => {
  const current = locationChange('harbor', 'market');
  const title: StoryChangeDelta = {
    kind: 'object',
    fields: {
      title: { kind: 'value', beforeExists: true, before: 'A', afterExists: true, after: 'B' },
    },
  };

  expect(normalizeLegacyStoryHistoryDelta(current)).toEqual(current);
  expect(normalizeLegacyStoryHistoryDelta(title)).toBe(title);
});
