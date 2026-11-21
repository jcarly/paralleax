import type { AuthUser } from '../api';
import { StoryListDialogs } from '../features/story-library/StoryListDialogs';
import {
  StoryListHeading,
  StoryListResults,
  StoryListToolbar,
} from '../features/story-library/StoryListParts';
import { useStoryListController } from '../features/story-library/useStoryListController';

type StoryListProps = {
  user: AuthUser | null;
  onStoryCreated?: (storyId: string) => void;
  onStoryDeleted?: (storyId: string) => void;
};

type StoryListController = ReturnType<typeof useStoryListController>;

export function StoryList(props: StoryListProps) {
  const controller = useStoryListController(props);
  return <StoryListPage controller={controller} />;
}

function StoryListPage({ controller }: { controller: StoryListController }) {
  return (
    <main className="product-page library-main">
      <StoryListHeader controller={controller} />
      <StoryListToolbarSection controller={controller} />
      <StoryListResultsSection controller={controller} />
      <StoryListDialogsSection controller={controller} />
    </main>
  );
}

function StoryListHeader({ controller }: { controller: StoryListController }) {
  const { isAuthenticated, isAdministrator, pending, operations, dialogs } = controller;
  return (
    <StoryListHeading
      isAuthenticated={isAuthenticated}
      isAdministrator={isAdministrator}
      pending={pending}
      createDemos={() => {
        void operations.createDemos();
      }}
      openImportDialog={dialogs.openImportDialog}
      openCreationDialog={dialogs.openCreationDialog}
    />
  );
}

function StoryListToolbarSection({ controller }: { controller: StoryListController }) {
  const { isAuthenticated, search } = controller;
  return (
    <StoryListToolbar
      isAuthenticated={isAuthenticated}
      query={search.query}
      setQuery={search.setQuery}
      filter={search.filter}
      setFilter={search.setFilter}
      sort={search.sort}
      setSort={search.setSort}
      view={search.view}
      setView={search.setView}
    />
  );
}

function StoryListResultsSection({ controller }: { controller: StoryListController }) {
  const { search, data, operations, isAuthenticated, error, dialogs, setRefreshVersion } =
    controller;
  return (
    <StoryListResults
      loading={data.loading}
      loadError={data.loadError}
      stories={data.stories}
      totalCount={data.totalCount}
      view={search.view}
      hasMore={data.hasMore}
      loadingMore={data.loadingMore}
      deletingStoryId={operations.deletingStoryId}
      error={error}
      query={search.query}
      filter={search.filter}
      isAuthenticated={isAuthenticated}
      retryLoading={() => {
        setRefreshVersion((version) => version + 1);
      }}
      loadMoreStories={() => {
        void data.loadMoreStories();
      }}
      removeStory={operations.removeStory}
      clearFilters={() => {
        clearStoryFilters(search.setQuery, search.setFilter);
      }}
      openCreationDialog={dialogs.openCreationDialog}
    />
  );
}

function StoryListDialogsSection({ controller }: { controller: StoryListController }) {
  const { dialogs, isAuthenticated, isAdministrator, pending, operations } = controller;
  return (
    <StoryListDialogs
      creating={dialogs.creating}
      importing={dialogs.importing}
      isAuthenticated={isAuthenticated}
      isAdministrator={isAdministrator}
      pending={pending}
      newTitle={operations.creation.newTitle}
      setNewTitle={operations.creation.setNewTitle}
      createStory={(event) => {
        void operations.creation.createStory(event);
      }}
      closeCreationDialog={dialogs.closeCreationDialog}
      closeImportDialog={dialogs.closeImportDialog}
      onImported={operations.onImported}
      onImportOutcomeUnknown={operations.onImportOutcomeUnknown}
    />
  );
}

function clearStoryFilters(
  setQuery: (query: string) => void,
  setFilter: (filter: 'all' | 'editable' | 'commentable' | 'owned') => void,
) {
  setQuery('');
  setFilter('all');
}
