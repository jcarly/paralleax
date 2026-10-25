import { describe, expect, it } from 'vitest';
import { groupImportedTriggerRoutes } from './story-builders.js';

describe('groupImportedTriggerRoutes', () => {
  it('merges condition variants for a source-target pair into OR groups', () => {
    expect(
      groupImportedTriggerRoutes([
        { inputInteractionId: 'source-a', conditionGroups: [[{ check: 'high' }]] },
        { inputInteractionId: 'source-a', conditionGroups: [[{ check: 'low' }]] },
      ]),
    ).toEqual([
      {
        inputInteractionIds: ['source-a'],
        conditionGroups: [[{ check: 'high' }], [{ check: 'low' }]],
      },
    ]);
  });

  it('shares a Trigger only when every source has the same complete condition set', () => {
    expect(
      groupImportedTriggerRoutes([
        { inputInteractionId: 'source-a', conditionGroups: [[{ check: 'high' }]] },
        { inputInteractionId: 'source-a', conditionGroups: [[{ check: 'low' }]] },
        { inputInteractionId: 'source-b', conditionGroups: [[{ check: 'high' }]] },
        { inputInteractionId: 'source-c', conditionGroups: [[{ check: 'high' }], [{ check: 'low' }]] },
      ]),
    ).toEqual([
      {
        inputInteractionIds: ['source-a', 'source-c'],
        conditionGroups: [[{ check: 'high' }], [{ check: 'low' }]],
      },
      {
        inputInteractionIds: ['source-b'],
        conditionGroups: [[{ check: 'high' }]],
      },
    ]);
  });

  it('keeps an unconditional route unconditional when conditional routes also target it', () => {
    expect(
      groupImportedTriggerRoutes([
        { inputInteractionId: 'source-a', conditionGroups: [[{ check: 'high' }]] },
        { inputInteractionId: 'source-a', conditionGroups: [[]] },
      ]),
    ).toEqual([{ inputInteractionIds: ['source-a'], conditionGroups: [[]] }]);
  });
});
