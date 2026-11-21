import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthUser } from '../../api';
import {
  useDemoStoryCreation,
  useStoryCreation,
  useStoryDeletion,
  useStoryImportHandler,
  useStoryListPending,
} from './useStoryListMutations';
import { useStoryListData } from './useStoryListData';
import { useStoryListDialogs } from './useStoryListDialogs';
import { useStoryListSearch } from './useStoryListSearch';

type StoryListControllerOptions = {
  user: AuthUser | null;
  onStoryCreated?: (storyId: string) => void;
  onStoryDeleted?: (storyId: string) => void;
};

function useStoryListUiState() {
  const search = useStoryListSearch();
  const [error, setError] = useState('');
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [pending, setPending] = useStoryListPending();
  return { search, error, setError, refreshVersion, setRefreshVersion, pending, setPending };
}

export function useStoryListController({
  user,
  onStoryCreated,
  onStoryDeleted,
}: StoryListControllerOptions) {
  const { t } = useTranslation();
  const identity = useStoryListIdentity(user);
  const ui = useStoryListUiState();
  const data = useStoryListData({
    userId: user === null ? undefined : user.id,
    isAuthenticated: identity.isAuthenticated,
    filter: ui.search.filter,
    sort: ui.search.sort,
    query: ui.search.debouncedQuery,
    refreshVersion: ui.refreshVersion,
    t,
    setError: ui.setError,
  });
  const dialogs = useStoryListDialogs(ui.setError);
  const operations = useStoryListOperations({
    user,
    onStoryCreated,
    onStoryDeleted,
    data,
    search: ui.search,
    dialogs,
    pending: ui.pending,
    setPending: ui.setPending,
    setError: ui.setError,
    setRefreshVersion: ui.setRefreshVersion,
    t,
  });

  return {
    t,
    user,
    ...identity,
    ...ui,
    data,
    dialogs,
    operations,
  };
}

function useStoryListIdentity(user: AuthUser | null) {
  return {
    isAuthenticated: user !== null,
    isAdministrator: user !== null && user.role === 'admin',
  };
}

type StoryListOperationOptions = {
  user: AuthUser | null;
  onStoryCreated?: (storyId: string) => void;
  onStoryDeleted?: (storyId: string) => void;
  data: ReturnType<typeof useStoryListData>;
  search: ReturnType<typeof useStoryListSearch>;
  dialogs: ReturnType<typeof useStoryListDialogs>;
  pending: 'story' | 'demo' | '';
  setPending: (pending: 'story' | 'demo' | '') => void;
  setError: (error: string) => void;
  setRefreshVersion: (update: (version: number) => number) => void;
  t: ReturnType<typeof useTranslation>['t'];
};

function useStoryListOperations(options: StoryListOperationOptions) {
  const { user, data, search, dialogs, pending, setPending, setError, t } = options;
  const countsAndStories = { setStories: data.setStories, setTotalCount: data.setTotalCount };
  const mutationContext = { pending, setPending, setError, user, t };
  const creation = useStoryCreation({
    ...mutationContext,
    closeDialog: dialogs.closeCreationDialog,
    onStoryCreated: options.onStoryCreated,
  });
  const createDemos = useDemoStoryCreation({
    ...mutationContext,
    ...countsAndStories,
    resetLibraryView: search.resetLibraryView,
  });
  const deletion = useStoryDeletion({
    ...countsAndStories,
    setError,
    setRefreshVersion: options.setRefreshVersion,
    onStoryDeleted: options.onStoryDeleted,
    t,
  });
  const onImported = useStoryImportHandler({
    user,
    ...countsAndStories,
    resetLibraryView: search.resetLibraryView,
  });
  const onImportOutcomeUnknown = () => {
    search.resetLibraryView();
    options.setRefreshVersion((version) => version + 1);
  };
  return { creation, createDemos, ...deletion, onImported, onImportOutcomeUnknown };
}
