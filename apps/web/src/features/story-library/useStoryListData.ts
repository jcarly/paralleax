import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { STORY_LIST_PAGE_SIZE, type StorySummary } from '@paralleax/shared';
import type { TFunction } from 'i18next';
import { api } from '../../api';
import type { StoryFilter, StorySort } from './storyListTypes';

type ListPage = Awaited<ReturnType<typeof api.listStories>>;
type PageRequestResult = { kind: 'loaded'; page: ListPage } | { kind: 'failed'; message: string };

type StoryListStore = {
  stories: StorySummary[];
  setStories: Dispatch<SetStateAction<StorySummary[]>>;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  totalCount: number;
  setTotalCount: Dispatch<SetStateAction<number>>;
  hasMore: boolean;
  setHasMore: Dispatch<SetStateAction<boolean>>;
  loadedRequestKey: string;
  setLoadedRequestKey: Dispatch<SetStateAction<string>>;
  loadError: string;
  setLoadError: Dispatch<SetStateAction<string>>;
};

type ListDataOptions = {
  userId: string | undefined;
  isAuthenticated: boolean;
  filter: StoryFilter;
  sort: StorySort;
  query: string;
  refreshVersion: number;
  t: TFunction;
  setError: (message: string) => void;
};

type StoryListSetters = Pick<
  StoryListStore,
  'setStories' | 'setPage' | 'setTotalCount' | 'setHasMore' | 'setLoadedRequestKey' | 'setLoadError'
>;

type InitialRequestOptions = Pick<
  ListDataOptions,
  'isAuthenticated' | 'filter' | 'sort' | 'query' | 't'
> & {
  requestKey: string;
  requestVersion: MutableRefObject<number>;
  setters: StoryListSetters;
};

type MoreRequestOptions = Pick<
  ListDataOptions,
  'isAuthenticated' | 'filter' | 'sort' | 'query' | 't' | 'setError'
> & {
  requestVersion: MutableRefObject<number>;
  setError: (message: string) => void;
  version: number;
  page: number;
  setStories: Dispatch<SetStateAction<StorySummary[]>>;
  setPage: Dispatch<SetStateAction<number>>;
  setTotalCount: Dispatch<SetStateAction<number>>;
  setHasMore: Dispatch<SetStateAction<boolean>>;
  setLoadingMore: Dispatch<SetStateAction<boolean>>;
};

async function describeApiError(caught: unknown, t: TFunction, fallback: string) {
  const { apiErrorMessage } = await import('../../apiErrorMessages');
  return apiErrorMessage(caught, t, fallback);
}

function useStoryListStore(): StoryListStore {
  const [stories, setStories] = useState<StorySummary[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadedRequestKey, setLoadedRequestKey] = useState('');
  const [loadError, setLoadError] = useState('');
  return {
    stories,
    setStories,
    page,
    setPage,
    totalCount,
    setTotalCount,
    hasMore,
    setHasMore,
    loadedRequestKey,
    setLoadedRequestKey,
    loadError,
    setLoadError,
  };
}

async function requestInitialPage({
  isAuthenticated,
  query,
  filter,
  sort,
  t,
}: Pick<
  ListDataOptions,
  'isAuthenticated' | 'query' | 'filter' | 'sort' | 't'
>): Promise<PageRequestResult> {
  try {
    const page = await api[isAuthenticated ? 'listStories' : 'listPublicStories']({
      page: 1,
      pageSize: STORY_LIST_PAGE_SIZE,
      query,
      filter: isAuthenticated ? filter : 'all',
      sort,
    });
    return { kind: 'loaded', page };
  } catch (caught) {
    return { kind: 'failed', message: await describeApiError(caught, t, t('library.loadFailed')) };
  }
}

function applyInitialPage(page: ListPage, setters: StoryListSetters) {
  setters.setStories(page.items);
  setters.setPage(page.page);
  setters.setTotalCount(page.totalCount);
  setters.setHasMore(page.hasMore);
  setters.setLoadError('');
}

function startInitialListRequest(options: InitialRequestOptions) {
  let active = true;
  const request = ++options.requestVersion.current;
  const isCurrent = () => active && options.requestVersion.current === request;
  void requestInitialPage(options)
    .then((result) => {
      if (!isCurrent()) {
        return;
      }
      if (result.kind === 'failed') {
        options.setters.setLoadError(result.message);
      } else {
        applyInitialPage(result.page, options.setters);
      }
    })
    .finally(() => {
      if (isCurrent()) {
        options.setters.setLoadedRequestKey(options.requestKey);
      }
    });
  return () => {
    active = false;
  };
}

function useInitialListRequest({
  isAuthenticated,
  filter,
  sort,
  query,
  t,
  requestKey,
  store,
}: Omit<InitialRequestOptions, 'requestVersion' | 'setters'> & { store: StoryListStore }) {
  const requestVersion = useRef(0);
  const { setStories, setPage, setTotalCount, setHasMore, setLoadError, setLoadedRequestKey } =
    store;
  useEffect(
    () =>
      startInitialListRequest({
        isAuthenticated,
        filter,
        sort,
        query,
        t,
        requestKey,
        requestVersion,
        setters: {
          setStories,
          setPage,
          setTotalCount,
          setHasMore,
          setLoadError,
          setLoadedRequestKey,
        },
      }),
    [
      filter,
      isAuthenticated,
      query,
      requestKey,
      setHasMore,
      setLoadError,
      setLoadedRequestKey,
      setPage,
      setStories,
      setTotalCount,
      sort,
      t,
    ],
  );
  return requestVersion;
}

function appendUniqueStories(current: StorySummary[], incoming: StorySummary[]) {
  return [...current, ...incoming.filter((item) => !current.some(({ id }) => id === item.id))];
}

async function requestMoreStories(
  options: MoreRequestOptions,
  loadingMore: boolean,
  hasMore: boolean,
) {
  if (!hasMore || loadingMore) {
    return;
  }
  try {
    options.setError('');
    options.setLoadingMore(true);
    const result = await api[options.isAuthenticated ? 'listStories' : 'listPublicStories']({
      page: options.page + 1,
      pageSize: STORY_LIST_PAGE_SIZE,
      query: options.query,
      filter: options.isAuthenticated ? options.filter : 'all',
      sort: options.sort,
    });
    if (options.version !== options.requestVersion.current) {
      return;
    }
    options.setStories((current) => appendUniqueStories(current, result.items));
    options.setPage(result.page);
    options.setTotalCount(result.totalCount);
    options.setHasMore(result.hasMore);
  } catch (caught) {
    if (options.version === options.requestVersion.current) {
      options.setError(
        await describeApiError(caught, options.t, options.t('library.loadMoreFailed')),
      );
    }
  } finally {
    options.setLoadingMore(false);
  }
}

function useStoryListPagination(
  options: Omit<MoreRequestOptions, 'version' | 'setLoadingMore'>,
  hasMore: boolean,
) {
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreStories = useCallback(
    () =>
      requestMoreStories(
        { ...options, version: options.requestVersion.current, setLoadingMore },
        loadingMore,
        hasMore,
      ),
    [options, loadingMore, hasMore],
  );
  return { loadingMore, loadMoreStories };
}

export function useStoryListData(options: ListDataOptions) {
  const store = useStoryListStore();
  const requestOwner = options.isAuthenticated ? (options.userId ?? 'authenticated') : 'public';
  const requestKey = [
    requestOwner,
    options.query,
    options.isAuthenticated ? options.filter : 'all',
    options.sort,
    options.refreshVersion,
  ].join(':');
  const requestVersion = useInitialListRequest({ ...options, requestKey, store });
  const pagination = useStoryListPagination(
    {
      ...options,
      requestVersion,
      page: store.page,
      setStories: store.setStories,
      setPage: store.setPage,
      setTotalCount: store.setTotalCount,
      setHasMore: store.setHasMore,
    },
    store.hasMore,
  );
  return {
    ...store,
    requestKey,
    requestVersion,
    loading: store.loadedRequestKey !== requestKey,
    ...pagination,
  };
}
