import { act, renderHook } from '@testing-library/react';
import type { ReactFlowInstance } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Story } from '@paralleax/shared';
import type { StoryFlowNode, TriggerFlowEdge } from '../../../storyGraph';
import { useStoryContextNavigation } from './useStoryContextNavigation';

describe('story context navigation', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it('filters context entities and navigates interaction text occurrences', () => {
    const harness = renderNavigation();

    act(() => harness.result.current.setSearchQuery(' ALARM '));

    expect(harness.result.current.navigationInteractionIds).toEqual(['source', 'target']);
    expect(harness.result.current.occurrenceCounts.get('source')).toBe(1);
    expect(harness.result.current.occurrenceCounts.get('target')).toBe(1);
    expect(harness.result.current.filteredStatDefinitions.map(({ id }) => id)).toEqual(['stat-1']);
    expect(harness.result.current.filteredLocations).toEqual([]);

    act(() => harness.result.current.navigateInteractions(1));
    expect(harness.selectInteraction).toHaveBeenCalledWith('source');
    expect(harness.focusInteraction).not.toHaveBeenCalled();
    expect(harness.fitView).toHaveBeenCalledWith({
      nodes: [{ id: 'source' }],
      duration: 250,
      padding: 0.7,
      maxZoom: 1,
    });

    act(() => harness.result.current.clearSearch());
    expect(harness.result.current.searchQuery).toBe('');
  });

  it('keeps context selected while navigating its referenced interactions', () => {
    const harness = renderNavigation({
      selectedId: 'source',
      selectedContextReference: { type: 'location', id: 'location-1' },
    });

    expect(harness.result.current.referencedInteractionIds).toEqual(['source', 'target']);
    expect([...harness.result.current.emphasizedInteractionIds!]).toEqual(['source', 'target']);
    expect(harness.result.current.currentNavigationIndex).toBe(0);

    act(() => harness.result.current.navigateInteractions(1));
    expect(harness.focusInteraction).toHaveBeenCalledWith('target');
    expect(harness.selectInteraction).not.toHaveBeenCalled();

    act(() => harness.result.current.navigateInteractions(-1));
    expect(harness.focusInteraction).toHaveBeenLastCalledWith('target');
  });

  it('owns panel persistence, section visibility, categories, and reference counts', () => {
    window.localStorage.setItem('paralleax-story-context-panel', 'collapsed');
    const harness = renderNavigation();

    expect(harness.result.current.isContextPanelOpen).toBe(false);
    expect(harness.result.current.locationCategories).toEqual(['Forest', 'Ship']);
    expect(harness.result.current.characterCategories).toEqual(['Crew']);
    expect(harness.result.current.contextReferenceCounts.locations.get('location-1')).toBe(2);
    expect(harness.result.current.contextReferenceCounts.characters.get('character-1')).toBe(2);
    expect(harness.result.current.contextReferenceCounts.stats.get('stat-1')).toBe(4);
    expect(harness.result.current.contextReferenceCounts.items.get('item-1')).toBe(2);

    act(() => harness.result.current.openContextPanel());
    expect(harness.result.current.isContextPanelOpen).toBe(true);
    expect(window.localStorage.getItem('paralleax-story-context-panel')).toBe('open');

    act(() => harness.result.current.toggleContextSection('stats'));
    expect(harness.result.current.openContextSections.stats).toBe(false);
    act(() => harness.result.current.openContextSection('stats'));
    expect(harness.result.current.openContextSections.stats).toBe(true);

    act(() => harness.result.current.toggleContextPanel());
    expect(harness.result.current.isContextPanelOpen).toBe(false);
    expect(window.localStorage.getItem('paralleax-story-context-panel')).toBe('collapsed');
  });
});

function renderNavigation(
  options: {
    selectedId?: string;
    selectedContextReference?:
      | { type: 'location'; id: string }
      | { type: 'character'; id: string }
      | { type: 'stat'; id: string }
      | { type: 'item'; id: string };
  } = {},
) {
  const selectInteraction = vi.fn();
  const focusInteraction = vi.fn();
  const fitView = vi.fn();
  const flowInstanceRef = {
    current: { fitView } as unknown as ReactFlowInstance<StoryFlowNode, TriggerFlowEdge>,
  };
  const hook = renderHook(() =>
    useStoryContextNavigation({
      story: storyFixture(),
      selectedId: options.selectedId,
      selectedContextReference: options.selectedContextReference,
      flowInstanceRef,
      selectInteraction,
      focusInteraction,
    }),
  );
  return { ...hook, selectInteraction, focusInteraction, fitView };
}

function storyFixture(): Story {
  return {
    id: 'story-1',
    title: 'Navigation',
    createdAt: '2026-08-26T08:00:00.000Z',
    updatedAt: '2026-08-26T08:00:00.000Z',
    locations: [
      {
        id: 'location-1',
        name: 'Bridge',
        description: '',
        category: 'Ship',
        stats: [{ id: 'location-stat', statDefinitionId: 'stat-1', initialValue: false }],
        items: [{ id: 'location-key', itemDefinitionId: 'item-1' }],
      },
      {
        id: 'location-2',
        name: 'Clearing',
        description: '',
        category: 'Forest',
      },
      {
        id: 'location-3',
        name: 'Engine room',
        description: '',
        category: ' Ship ',
      },
    ],
    characters: [
      {
        id: 'character-1',
        name: 'Captain',
        description: '',
        category: 'Crew',
        stats: [{ id: 'character-stat', statDefinitionId: 'stat-1', initialValue: false }],
        items: [{ id: 'character-key', itemDefinitionId: 'item-1' }],
      },
    ],
    statDefinitions: [{ id: 'stat-1', name: 'Alarm', valueType: 'boolean', category: 'Ship' }],
    stats: [{ id: 'story-stat', statDefinitionId: 'stat-1', initialValue: false }],
    itemDefinitions: [
      {
        id: 'item-1',
        name: 'Key',
        description: '',
        category: 'Tools',
        stats: [{ id: 'item-stat', statDefinitionId: 'stat-1', initialValue: false }],
      },
    ],
    interactions: [
      {
        id: 'source',
        title: 'Alarm source',
        body: '',
        locationId: 'location-1',
        characterIds: ['character-1'],
        position: { x: 0, y: 0 },
        triggers: [{ id: 'source-trigger', inputInteractionIds: [], conditions: [] }],
      },
      {
        id: 'target',
        title: 'Target',
        body: 'The alarm rings.',
        locationId: 'location-1',
        characterIds: ['character-1'],
        position: { x: 0, y: 200 },
        triggers: [{ id: 'target-trigger', inputInteractionIds: ['source'], conditions: [] }],
      },
    ],
  };
}
