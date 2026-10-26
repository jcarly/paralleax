import { describe, expect, it } from 'vitest';
import type { Story } from '../model/index.js';
import { deleteTriggerInStory } from '../operations/triggers.js';
import { findNewTriggerInputConflict, findTriggerConnectionConflict } from './connections.js';

const story: Story = {
  id: 'story-1',
  title: 'Connections',
  createdAt: '2026-10-25T08:00:00.000Z',
  updatedAt: '2026-10-25T08:00:00.000Z',
  interactions: [
    {
      id: 'source-a',
      title: 'A',
      body: '',
      position: { x: 0, y: 0 },
      triggers: [{ id: 'root-a', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'source-b',
      title: 'B',
      body: '',
      position: { x: 0, y: 100 },
      triggers: [{ id: 'root-b', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'source-c',
      title: 'C',
      body: '',
      position: { x: 0, y: 150 },
      triggers: [{ id: 'root-c', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'target',
      title: 'Target',
      body: '',
      position: { x: 0, y: 200 },
      triggers: [
        { id: 'trigger-one', inputInteractionIds: ['source-a'], conditions: [] },
        { id: 'trigger-two', inputInteractionIds: ['source-b'], conditions: [] },
      ],
    },
  ],
};

describe('trigger connection policy', () => {
  it('detects a repeated directed source -> target pair across Triggers', () => {
    expect(findTriggerConnectionConflict(story, 'source-a', 'target')).toEqual({
      sourceInteractionId: 'source-a',
      targetInteractionId: 'target',
      existingTriggerId: 'trigger-one',
    });
  });

  it('keeps direction, target, and Trigger ownership distinct', () => {
    expect(findTriggerConnectionConflict(story, 'target', 'source-a')).toBeUndefined();
    expect(findTriggerConnectionConflict(story, 'source-a', 'source-b')).toBeUndefined();
    expect(
      findTriggerConnectionConflict(story, 'source-a', 'target', 'trigger-one'),
    ).toBeUndefined();
  });

  it('allows several sources on one Trigger and different sources on Triggers to one target', () => {
    expect(
      findNewTriggerInputConflict(story, 'target', ['source-a', 'source-c'], {
        triggerId: 'trigger-one',
        existingInputInteractionIds: ['source-a'],
      }),
    ).toBeUndefined();
    expect(findNewTriggerInputConflict(story, 'target', ['source-c'])).toBeUndefined();
  });

  it('checks only newly added pairs when editing a legacy duplicate Trigger', () => {
    const legacyStory = structuredClone(story);
    legacyStory.interactions
      .find(({ id }) => id === 'target')!
      .triggers.push({
        id: 'legacy-duplicate',
        inputInteractionIds: ['source-a'],
        conditions: [],
      });

    expect(
      findNewTriggerInputConflict(legacyStory, 'target', ['source-a', 'source-c'], {
        triggerId: 'legacy-duplicate',
        existingInputInteractionIds: ['source-a'],
      }),
    ).toBeUndefined();
    expect(
      findNewTriggerInputConflict(legacyStory, 'target', ['source-a'], {
        triggerId: 'trigger-two',
        existingInputInteractionIds: ['source-b'],
      }),
    ).toMatchObject({ existingTriggerId: 'trigger-one', sourceInteractionId: 'source-a' });
  });

  it('allows a new connection after its old input is removed', () => {
    const withoutConnection = deleteTriggerInStory(story, 'target', 'trigger-one');
    expect(findTriggerConnectionConflict(withoutConnection, 'source-a', 'target')).toBeUndefined();
  });
});
