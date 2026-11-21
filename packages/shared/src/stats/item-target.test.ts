import { describe, expect, it } from 'vitest';
import { statItemTargetIssue } from './item-target.js';

describe('stat item target ownership', () => {
  it('allows non-item stats only without an instance', () => {
    expect(statItemTargetIssue({ ownerType: 'story' })).toBeUndefined();
    expect(statItemTargetIssue({ ownerType: 'character', itemId: 'item' })).toBe(
      'non_item_with_instance',
    );
  });

  it('requires an instance of the assignment owner definition', () => {
    const owner = { ownerType: 'itemDefinition' as const, ownerId: 'definition' };
    expect(statItemTargetIssue(owner)).toBe('item_without_instance');
    expect(statItemTargetIssue({ ...owner, itemId: 'item' })).toBe('item_definition_mismatch');
    expect(statItemTargetIssue({ ...owner, itemId: 'item', itemDefinitionId: 'other' })).toBe(
      'item_definition_mismatch',
    );
    expect(
      statItemTargetIssue({ ...owner, itemId: 'item', itemDefinitionId: 'definition' }),
    ).toBeUndefined();
  });
});
