import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Story } from '@paralleax/shared';
import { buildReaderProgressState } from '@paralleax/shared';
import { useReaderSessionState } from './useReaderSessionState';

describe('useReaderSessionState', () => {
  it('keeps the shared replay result as the single reader session state', () => {
    const { result } = renderHook(() => useReaderSessionState());

    expect(result.current.session.journeyInteractionIds).toEqual([]);
    expect(result.current.session.currentInteractionId).toBeNull();

    act(() => {
      result.current.replay(storyFixture(), ['missing', 'start', 'start', 'next']);
    });

    expect(result.current.session.journeyInteractionIds).toEqual(['start', 'start', 'next']);
    expect(result.current.session.currentInteractionId).toBe('next');
    expect(result.current.session.visitedInteractionIds).toEqual(['start', 'next']);
    expect(result.current.session.currentLocationId).toBe('bridge');
    expect(result.current.session.stepStartedAt).toHaveLength(4);
  });

  it('advances incrementally to the same deterministic state as a full replay', () => {
    const story = storyFixture();
    story.statDefinitions = [
      { id: 'number', name: 'Number', valueType: 'number', changePerHour: 2 },
    ];
    story.stats = [{ id: 'score', statDefinitionId: 'number', initialValue: 2 }];
    story.itemDefinitions = [
      {
        id: 'battery',
        name: 'Battery',
        description: '',
        stats: [{ id: 'charge', statDefinitionId: 'number', initialValue: 5 }],
      },
    ];
    story.locations![0].items = [{ id: 'battery-1', itemDefinitionId: 'battery' }];
    story.interactions[1].durationMinutes = 30;
    story.interactions[1].statEffects = [
      { statId: 'charge', itemId: 'battery-1', operation: 'add', value: 1 },
      { statId: 'score', operation: 'set', expression: '@{charge|battery-1} * 2' },
    ];
    const { result } = renderHook(() => useReaderSessionState());

    act(() => result.current.replay(story, ['start'], [], 'saved-seed'));
    act(() => result.current.advance(story, story.interactions[1]));

    expect(result.current.session.statValues).toEqual({ score: 14 });
    expect(result.current.session.itemStatValues).toEqual({ 'battery-1': { charge: 7 } });

    expect(result.current.session).toEqual(
      buildReaderProgressState(
        story,
        ['start', 'next'],
        [],
        'saved-seed',
        result.current.session.stepStartedAt,
      ),
    );
  });
});

function storyFixture(): Story {
  return {
    id: 'story-1',
    title: 'Reader session',
    createdAt: '2026-08-26T08:00:00.000Z',
    updatedAt: '2026-08-26T08:00:00.000Z',
    locations: [{ id: 'bridge', name: 'Bridge', description: '', stats: [], items: [] }],
    interactions: [
      {
        id: 'start',
        title: 'Start',
        body: '',
        locationId: 'bridge',
        position: { x: 0, y: 0 },
        triggers: [{ id: 'start-trigger', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'next',
        title: 'Next',
        body: '',
        position: { x: 100, y: 0 },
        triggers: [{ id: 'next-trigger', inputInteractionIds: ['start'], conditions: [] }],
      },
    ],
  };
}
