import { describe, expect, it } from 'vitest';
import type { Story } from '@paralleax/shared';
import { findCreatedTrigger, getPendingConnection } from './storyConnection';

const story: Story = {
  id: 'story-1',
  title: 'Connection story',
  createdAt: '2026-07-14T08:00:00.000Z',
  updatedAt: '2026-07-14T08:00:00.000Z',
  interactions: [
    {
      id: 'interaction-1',
      title: 'First',
      body: 'First body',
      position: { x: 80, y: 120 },
      triggers: [{ id: 'trigger-root', inputInteractionIds: [], conditions: [] }],
    },
    {
      id: 'interaction-2',
      title: 'Second',
      body: 'Second body',
      position: { x: 420, y: 120 },
      triggers: [
        {
          id: 'trigger-existing',
          inputInteractionIds: ['interaction-3'],
          conditions: [],
        },
      ],
    },
    {
      id: 'interaction-3',
      title: 'Third',
      body: 'Third body',
      position: { x: 80, y: 320 },
      triggers: [],
    },
  ],
};

describe('story connection helpers', () => {
  it('prepares a valid pending connection', () => {
    const pending = getPendingConnection(story, {
      source: 'interaction-1',
      target: 'interaction-2',
      sourceHandle: null,
      targetHandle: null,
    });

    expect(pending?.sourceId).toBe('interaction-1');
    expect(pending?.target.id).toBe('interaction-2');
    expect(pending?.existingTriggerIds.has('trigger-existing')).toBe(true);
  });

  it('ignores missing, self, unknown target, and duplicate connections', () => {
    expect(
      getPendingConnection(undefined, {
        source: 'interaction-1',
        target: 'interaction-2',
        sourceHandle: null,
        targetHandle: null,
      }),
    ).toBeUndefined();
    expect(
      getPendingConnection(story, {
        source: 'interaction-1',
        target: 'interaction-1',
        sourceHandle: null,
        targetHandle: null,
      }),
    ).toBeUndefined();
    expect(
      getPendingConnection(story, {
        source: 'interaction-1',
        target: 'missing',
        sourceHandle: null,
        targetHandle: null,
      }),
    ).toBeUndefined();
    expect(
      getPendingConnection(story, {
        source: 'interaction-3',
        target: 'interaction-2',
        sourceHandle: null,
        targetHandle: null,
      }),
    ).toBeUndefined();
  });

  it('finds the trigger created by the API response', () => {
    const withNewTrigger = structuredClone(story);
    withNewTrigger.interactions[1].triggers.push({
      id: 'trigger-new',
      inputInteractionIds: [],
      conditions: [],
    });

    expect(
      findCreatedTrigger(withNewTrigger, 'interaction-2', new Set(['trigger-existing']))?.id,
    ).toBe('trigger-new');
  });

  it('falls back to the last target trigger when ids cannot identify the created one', () => {
    expect(findCreatedTrigger(story, 'interaction-2', new Set(['trigger-existing']))?.id).toBe(
      'trigger-existing',
    );
  });

  it('returns undefined when the target has no trigger in the API response', () => {
    expect(findCreatedTrigger(story, 'interaction-3', new Set())).toBeUndefined();
    expect(findCreatedTrigger(story, 'missing', new Set())).toBeUndefined();
  });
});
