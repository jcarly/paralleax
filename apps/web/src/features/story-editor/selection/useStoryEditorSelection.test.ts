import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Story } from '@paralleax/shared';
import { buildInteractionNodes, buildTriggerNodes } from '../../../storyGraph';
import { useStoryEditorSelection } from './useStoryEditorSelection';

describe('story editor selection', () => {
  it('resolves each exclusive inspector target from the canonical story', () => {
    const { result } = renderSelection();

    act(() => result.current.selectExclusive({ type: 'location', id: 'location-1' }));
    expect(result.current.selectedLocation?.name).toBe('Bridge');
    expect(result.current.selectedContextReference).toEqual({ type: 'location', id: 'location-1' });
    expect(result.current.selectedCommentTarget).toEqual({
      targetType: 'location',
      targetId: 'location-1',
    });

    act(() => result.current.selectExclusive({ type: 'character', id: 'character-1' }));
    expect(result.current.selectedCharacter?.name).toBe('Captain');
    expect(result.current.selectedLocation).toBeUndefined();

    act(() => result.current.selectExclusive({ type: 'statDefinition', id: 'stat-1' }));
    expect(result.current.selectedStatDefinition?.name).toBe('Alarm');

    act(() => result.current.selectExclusive({ type: 'itemDefinition', id: 'item-1' }));
    expect(result.current.selectedItemDefinition?.name).toBe('Key');

    act(() => result.current.selectExclusive({ type: 'graphDecoration', id: 'decoration-1' }));
    expect(result.current.selectedGraphDecoration?.kind).toBe('frame');

    act(() => result.current.selectExclusive({ type: 'statDefinitionCreation' }));
    expect(result.current.isCreatingStatDefinition).toBe(true);
    expect(result.current.selectedGraphDecoration).toBeUndefined();

    act(() => result.current.selectExclusive({ type: 'interaction', id: 'target' }));
    expect(result.current.selected?.title).toBe('Target');
    expect(result.current.isCreatingStatDefinition).toBe(false);

    act(() =>
      result.current.selectExclusive({
        type: 'trigger',
        trigger: { interactionId: 'target', triggerId: 'target-trigger' },
      }),
    );
    expect(result.current.selectedTriggerTarget?.trigger.id).toBe('target-trigger');
    expect(result.current.selected).toBeUndefined();
    expect(result.current.hasInspectorSelection).toBe(true);
  });

  it('can focus an interaction while preserving context navigation', () => {
    const { result } = renderSelection();

    act(() => result.current.selectExclusive({ type: 'location', id: 'location-1' }));
    act(() => result.current.focusInteraction('target'));

    expect(result.current.selected?.id).toBe('target');
    expect(result.current.selectedLocation?.id).toBe('location-1');
    expect(result.current.selectedContextReference).toEqual({ type: 'location', id: 'location-1' });
    expect(result.current.selectedCommentTarget).toEqual({
      targetType: 'interaction',
      targetId: 'target',
    });

    act(() => result.current.clearSelection());
    expect(result.current.hasInspectorSelection).toBe(false);
    expect(result.current.selected).toBeUndefined();
    expect(result.current.selectedLocation).toBeUndefined();
  });

  it('captures only interaction and trigger nodes during an active rectangle gesture', () => {
    const story = storyFixture();
    const { result } = renderHook(() => useStoryEditorSelection(story));
    const interactionNode = buildInteractionNodes(story, undefined)[0];
    const triggerNode = buildTriggerNodes(story)[0];

    act(() => result.current.handleGraphSelectionChange({ nodes: [interactionNode], edges: [] }));
    expect(result.current.graphSelection).toBeUndefined();

    act(() => result.current.handleGraphSelectionStart());
    act(() =>
      result.current.handleGraphSelectionChange({
        nodes: [interactionNode, triggerNode],
        edges: [],
      }),
    );
    act(() => result.current.handleGraphSelectionEnd());

    expect(result.current.graphSelection).toEqual({
      interactionIds: ['source'],
      triggers: [
        {
          nodeId: 'trigger:target:target-trigger',
          interactionId: 'target',
          triggerId: 'target-trigger',
          triggerIds: ['target-trigger'],
        },
      ],
    });
    expect([...result.current.selectedGraphNodeIds]).toEqual([
      'source',
      'trigger:target:target-trigger',
    ]);

    act(() => result.current.handleGraphSelectionStart());
    act(() => result.current.handleGraphSelectionEnd());
    expect(result.current.graphSelection).toBeUndefined();
  });
});

function renderSelection() {
  return renderHook(() => useStoryEditorSelection(storyFixture()));
}

function storyFixture(): Story {
  return {
    id: 'story-1',
    title: 'Selection',
    createdAt: '2026-08-26T08:00:00.000Z',
    updatedAt: '2026-08-26T08:00:00.000Z',
    graphDecorations: [
      {
        id: 'decoration-1',
        kind: 'frame',
        position: { x: 0, y: 0 },
        width: 400,
        height: 300,
        color: '#334455',
      },
    ],
    locations: [{ id: 'location-1', name: 'Bridge', description: '' }],
    characters: [{ id: 'character-1', name: 'Captain', description: '' }],
    statDefinitions: [{ id: 'stat-1', name: 'Alarm', valueType: 'boolean' }],
    itemDefinitions: [{ id: 'item-1', name: 'Key', description: '' }],
    interactions: [
      {
        id: 'source',
        title: 'Source',
        body: '',
        position: { x: 0, y: 0 },
        triggers: [{ id: 'source-trigger', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'target',
        title: 'Target',
        body: '',
        position: { x: 0, y: 200 },
        triggers: [{ id: 'target-trigger', inputInteractionIds: ['source'], conditions: [] }],
      },
    ],
  };
}
