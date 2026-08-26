import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import type { Story } from '@paralleax/shared';
import type { ReactFlowInstance } from '@xyflow/react';
import type { StoryFlowNode, TriggerFlowEdge } from '../../../storyGraph';
import {
  getInteractionTextOccurrenceCounts,
  getReferencedInteractionIds,
  getStoryContextCategorySuggestions,
  getStoryContextReferenceCounts,
  matchesStoryContextSearch,
  type StoryContextReference,
} from '../../../storyNavigation';

export type StoryContextSection = 'locations' | 'characters' | 'stats' | 'items';

interface StoryContextNavigationDependencies {
  story: Story | undefined;
  selectedId: string | undefined;
  selectedContextReference: StoryContextReference | undefined;
  flowInstanceRef: RefObject<ReactFlowInstance<StoryFlowNode, TriggerFlowEdge> | null>;
  selectInteraction: (interactionId: string) => void;
  focusInteraction: (interactionId: string) => void;
}

const storyContextPanelStorageKey = 'paralleax-story-context-panel';

export function useStoryContextNavigation({
  story,
  selectedId,
  selectedContextReference,
  flowInstanceRef,
  selectInteraction,
  focusInteraction,
}: StoryContextNavigationDependencies) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isContextPanelOpen, setIsContextPanelOpen] = useState(getInitialContextPanelOpen);
  const [openContextSections, setOpenContextSections] = useState<
    Record<StoryContextSection, boolean>
  >({
    locations: true,
    characters: true,
    stats: true,
    items: true,
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        storyContextPanelStorageKey,
        isContextPanelOpen ? 'open' : 'collapsed',
      );
    } catch {
      // The editor remains usable when browser storage is unavailable.
    }
  }, [isContextPanelOpen]);

  const toggleContextPanel = useCallback(() => setIsContextPanelOpen((isOpen) => !isOpen), []);
  const openContextPanel = useCallback(() => setIsContextPanelOpen(true), []);
  const toggleContextSection = useCallback((section: StoryContextSection) => {
    setOpenContextSections((sections) => ({ ...sections, [section]: !sections[section] }));
  }, []);
  const openContextSection = useCallback((section: StoryContextSection) => {
    setOpenContextSections((sections) =>
      sections[section] ? sections : { ...sections, [section]: true },
    );
  }, []);
  const clearSearch = useCallback(() => setSearchQuery(''), []);

  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const occurrenceCounts = useMemo(
    () => getInteractionTextOccurrenceCounts(story, searchQuery),
    [searchQuery, story],
  );
  const referencedInteractionIds = useMemo(
    () => getReferencedInteractionIds(story, selectedContextReference),
    [selectedContextReference, story],
  );
  const navigationInteractionIds = useMemo(
    () => (normalizedSearchQuery ? [...occurrenceCounts.keys()] : referencedInteractionIds),
    [normalizedSearchQuery, occurrenceCounts, referencedInteractionIds],
  );
  const currentNavigationIndex = selectedId ? navigationInteractionIds.indexOf(selectedId) : -1;
  const emphasizedInteractionIds = useMemo(
    () =>
      selectedContextReference?.type === 'location' ||
      selectedContextReference?.type === 'character'
        ? new Set(referencedInteractionIds)
        : undefined,
    [referencedInteractionIds, selectedContextReference?.type],
  );
  const filteredLocations = useMemo(
    () =>
      (story?.locations ?? []).filter((location) =>
        matchesStoryContextSearch(location, normalizedSearchQuery),
      ),
    [normalizedSearchQuery, story?.locations],
  );
  const filteredCharacters = useMemo(
    () =>
      (story?.characters ?? []).filter((character) =>
        matchesStoryContextSearch(character, normalizedSearchQuery),
      ),
    [normalizedSearchQuery, story?.characters],
  );
  const filteredStatDefinitions = useMemo(
    () =>
      (story?.statDefinitions ?? []).filter((definition) =>
        matchesStoryContextSearch(definition, normalizedSearchQuery),
      ),
    [normalizedSearchQuery, story?.statDefinitions],
  );
  const filteredItemDefinitions = useMemo(
    () =>
      (story?.itemDefinitions ?? []).filter((definition) =>
        matchesStoryContextSearch(definition, normalizedSearchQuery),
      ),
    [normalizedSearchQuery, story?.itemDefinitions],
  );
  const locationCategories = useMemo(
    () => getStoryContextCategorySuggestions(story?.locations ?? []),
    [story?.locations],
  );
  const characterCategories = useMemo(
    () => getStoryContextCategorySuggestions(story?.characters ?? []),
    [story?.characters],
  );
  const statCategories = useMemo(
    () => getStoryContextCategorySuggestions(story?.statDefinitions ?? []),
    [story?.statDefinitions],
  );
  const itemCategories = useMemo(
    () => getStoryContextCategorySuggestions(story?.itemDefinitions ?? []),
    [story?.itemDefinitions],
  );
  const contextReferenceCounts = useMemo(() => getStoryContextReferenceCounts(story), [story]);

  const navigateInteractions = useCallback(
    (direction: -1 | 1) => {
      if (navigationInteractionIds.length === 0) return;
      const nextIndex =
        currentNavigationIndex < 0
          ? direction > 0
            ? 0
            : navigationInteractionIds.length - 1
          : (currentNavigationIndex + direction + navigationInteractionIds.length) %
            navigationInteractionIds.length;
      const interactionId = navigationInteractionIds[nextIndex];
      if (normalizedSearchQuery) selectInteraction(interactionId);
      else focusInteraction(interactionId);
      window.requestAnimationFrame(() => {
        void flowInstanceRef.current?.fitView({
          nodes: [{ id: interactionId }],
          duration: 250,
          padding: 0.7,
          maxZoom: 1,
        });
      });
    },
    [
      currentNavigationIndex,
      flowInstanceRef,
      focusInteraction,
      navigationInteractionIds,
      normalizedSearchQuery,
      selectInteraction,
    ],
  );

  return {
    searchQuery,
    setSearchQuery,
    clearSearch,
    isContextPanelOpen,
    toggleContextPanel,
    openContextPanel,
    openContextSections,
    toggleContextSection,
    openContextSection,
    occurrenceCounts,
    referencedInteractionIds,
    navigationInteractionIds,
    currentNavigationIndex,
    emphasizedInteractionIds,
    filteredLocations,
    filteredCharacters,
    filteredStatDefinitions,
    filteredItemDefinitions,
    locationCategories,
    characterCategories,
    statCategories,
    itemCategories,
    contextReferenceCounts,
    navigateInteractions,
  };
}

function getInitialContextPanelOpen() {
  try {
    return window.localStorage.getItem(storyContextPanelStorageKey) !== 'collapsed';
  } catch {
    return true;
  }
}
