import { describe, expect, it } from 'vitest';
import type { Story } from '../model/index.js';
import { getStatTargets, resolveStatInterpolationTarget } from './targets.js';

describe('stat targets', () => {
  it('projects non-item assignments and every exact authored item target', () => {
    const story = storyFixture();

    expect(
      getStatTargets(story).map(({ assignment, itemId, ownerType }) => ({
        assignmentId: assignment.id,
        itemId,
        ownerType,
      })),
    ).toEqual([
      { assignmentId: 'story-energy', itemId: undefined, ownerType: 'story' },
      { assignmentId: 'mira-energy', itemId: undefined, ownerType: 'character' },
      { assignmentId: 'harbor-energy', itemId: undefined, ownerType: 'location' },
      { assignmentId: 'battery-charge', itemId: 'battery-1', ownerType: 'itemDefinition' },
    ]);
  });

  it('resolves author references by unique owner and variable names or ids', () => {
    const story = storyFixture();

    expect(resolveStatInterpolationTarget(story, 'story.energy')?.assignment.id).toBe(
      'story-energy',
    );
    expect(resolveStatInterpolationTarget(story, ' MIRA . ENERGY ')?.assignment.id).toBe(
      'mira-energy',
    );
    expect(resolveStatInterpolationTarget(story, 'harbor.energy-definition')?.assignment.id).toBe(
      'harbor-energy',
    );
    expect(resolveStatInterpolationTarget(story, 'battery-1.charge')).toMatchObject({
      itemId: 'battery-1',
      assignment: { id: 'battery-charge' },
    });
  });

  it('rejects malformed, unknown, and ambiguous author references', () => {
    const story = storyFixture();
    story.characters!.push({
      id: 'other-mira',
      name: 'Mira',
      description: '',
      stats: [{ id: 'other-mira-energy', statDefinitionId: 'energy-definition', initialValue: 8 }],
    });

    expect(resolveStatInterpolationTarget(story, 'Mira.Energy')).toBeUndefined();
    expect(resolveStatInterpolationTarget(story, 'Unknown.Energy')).toBeUndefined();
    expect(resolveStatInterpolationTarget(story, 'Mira')).toBeUndefined();
    expect(resolveStatInterpolationTarget(story, 'Mira.Energy.extra')).toBeUndefined();
  });
});

function storyFixture(): Story {
  return {
    id: 'story-1',
    title: 'Story',
    createdAt: '2026-08-27T08:00:00.000Z',
    updatedAt: '2026-08-27T08:00:00.000Z',
    statDefinitions: [
      { id: 'energy-definition', name: 'Energy', valueType: 'number' },
      { id: 'charge-definition', name: 'Charge', valueType: 'number' },
    ],
    stats: [{ id: 'story-energy', statDefinitionId: 'energy-definition', initialValue: 1 }],
    characters: [
      {
        id: 'mira',
        name: 'Mira',
        description: '',
        stats: [{ id: 'mira-energy', statDefinitionId: 'energy-definition', initialValue: 5 }],
        items: [{ id: 'battery-1', itemDefinitionId: 'battery-definition' }],
      },
    ],
    locations: [
      {
        id: 'harbor',
        name: 'Harbor',
        description: '',
        stats: [{ id: 'harbor-energy', statDefinitionId: 'energy-definition', initialValue: 3 }],
      },
    ],
    itemDefinitions: [
      {
        id: 'battery-definition',
        name: 'Battery',
        description: '',
        stats: [{ id: 'battery-charge', statDefinitionId: 'charge-definition', initialValue: 10 }],
      },
    ],
    interactions: [],
  };
}
