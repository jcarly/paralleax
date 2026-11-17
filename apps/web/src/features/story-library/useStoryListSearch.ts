import { useEffect, useState } from 'react';
import type { StoryFilter, StorySort, StoryView } from './storyListTypes';

export function useStoryListSearch() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<StoryFilter>('all');
  const [sort, setSort] = useState<StorySort>('updated');
  const [view, setView] = useState<StoryView>('grid');

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedQuery(query);
    }, 250);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [query]);

  function resetLibraryView() {
    setQuery('');
    setDebouncedQuery('');
    setFilter('all');
    setSort('updated');
  }

  return {
    query,
    setQuery,
    debouncedQuery,
    filter,
    setFilter,
    sort,
    setSort,
    view,
    setView,
    resetLibraryView,
  };
}
