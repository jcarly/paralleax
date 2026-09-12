import { STORY_EDITOR_PAGE_SIZE, STORY_LIST_PAGE_SIZE } from '@paralleax/shared';
import type {
  CharacterMutationResult,
  ChoiceScriptImportReport,
  ChoiceScriptSourceFile,
  QspImportReport,
  QspSourceFormat,
  CommentAnchor,
  CharacterItemMutationResult,
  CharacterStatMutationResult,
  CreateReaderSaveInput,
  CreateCharacterInput,
  CreateStatAssignmentInput,
  CreateCharacterItemInput,
  CreateCharacterStatInput,
  CreateInteractionInput,
  CreateGraphDecorationInput,
  CreateItemDefinitionInput,
  CreateLocationInput,
  CreateStatDefinitionInput,
  InteractionMutationResult,
  GraphDecorationMutationResult,
  ItemDefinitionMutationResult,
  LocationMutationResult,
  MoveItemInstanceInput,
  PaginatedResult,
  ReaderProgress,
  ReaderAutosaveMode,
  ReaderSave,
  ReaderSaveSummary,
  SaveReaderProgressInput,
  StatDefinitionMutationResult,
  Story,
  StoryEditorBootstrap,
  StoryEditorContextPage,
  StoryEditorInteractionContentPage,
  StoryEditorInteractionPage,
  StoryEditorTriggerContentPage,
  StoryEditorTriggerPage,
  StoryHistory,
  StoryHistoryMutationResult,
  StoryGraphPositionUpdates,
  StoryMutationMetadata,
  StoryRuntimeBootstrap,
  StoryRuntimeContextPage,
  StoryRuntimeSlice,
  StoryRuntimeSliceRequest,
  StoryCommentThread,
  StorySummary,
  StoryListOptions,
  TriggerMutationResult,
  UpdateInteractionInput,
  UpdateStatAssignmentInput,
  UpdateGraphDecorationInput,
  UpdateItemDefinitionInput,
  UpdateCharacterInput,
  UpdateCharacterStatInput,
  UpdateLocationInput,
  UpdateStatDefinitionInput,
  UpdateTriggerInput,
  UpdateStoryInput,
  StoryAccessConfiguration,
  StoryAccessSettings,
  StoryCollaboratorRole,
  UserRole,
} from '@paralleax/shared';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!response.ok) {
    throw apiError(path, response.status, await response.text());
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}

function uploadBinary<T>(
  path: string,
  content: Blob,
  onUploadProgress?: (percentage: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api${path}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || event.total <= 0) return;
      onUploadProgress?.(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.upload.onload = () => onUploadProgress?.(100);
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(apiError(path, xhr.status, xhr.responseText));
        return;
      }
      try {
        resolve(xhr.status === 204 ? (undefined as T) : (JSON.parse(xhr.responseText) as T));
      } catch {
        reject(new ApiError('The server returned an invalid JSON response', xhr.status));
      }
    };
    xhr.onerror = () => reject(new ApiError('The server could not be reached', 0));
    xhr.send(content);
  });
}

function apiError(path: string, status: number, body: string) {
  if (status === 401 && !path.startsWith('/auth/')) {
    window.dispatchEvent(new Event('paralleax:session-expired'));
  }
  let message = body || `HTTP ${status}`;
  let code: string | undefined;
  let requestId: string | undefined;
  try {
    const error = JSON.parse(body) as {
      code?: string;
      message?: string | string[];
      requestId?: string;
    };
    if (Array.isArray(error.message)) message = error.message.join(', ');
    else if (error.message) message = error.message;
    code = error.code;
    requestId = error.requestId;
  } catch {
    // Preserve plain-text and non-JSON error responses.
  }
  return new ApiError(message, status, code, requestId);
}

function readerProgressPath(storyId: string, mode: ReaderAutosaveMode): string {
  return `/stories/${storyId}/progress${mode === 'simulation' ? '/simulation' : ''}`;
}

function paginationPath(path: string, page: number, pageSize: number): string {
  const search = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  return `${path}?${search.toString()}`;
}

function storyListPath(path: string, options: Partial<StoryListOptions>): string {
  const search = new URLSearchParams({
    page: String(options.page ?? 1),
    pageSize: String(options.pageSize ?? STORY_LIST_PAGE_SIZE),
    filter: options.filter ?? 'all',
    sort: options.sort ?? 'updated',
  });
  const query = options.query?.trim();
  if (query) search.set('query', query);
  return `${path}?${search.toString()}`;
}

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
}
export interface ManagedUser {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  createdAt: string;
}
type InteractionSaveResponse = InteractionMutationResult | Story;
type TriggerSaveResponse = TriggerMutationResult | Story;
export interface ChoiceScriptImportResponse {
  story: Story;
  report: ChoiceScriptImportReport;
}
export interface QspImportResponse {
  story: Story;
  report: QspImportReport;
}
export const api = {
  me: () => request<AuthUser>('/auth/me'),
  register: (email: string, password: string, displayName: string, accessCode?: string) =>
    request<AuthUser>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        password,
        displayName,
        ...(accessCode ? { accessCode } : {}),
      }),
    }),
  login: (email: string, password: string) =>
    request<AuthUser>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  updateCurrentUser: (displayName: string) =>
    request<AuthUser>('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ displayName }),
    }),
  listUsers: () => request<ManagedUser[]>('/admin/users'),
  updateUserRole: (id: string, role: UserRole) =>
    request<ManagedUser>(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  listStories: (options: Partial<StoryListOptions> = {}) =>
    request<PaginatedResult<StorySummary>>(storyListPath('/stories', options)),
  listPublicStories: (options: Partial<StoryListOptions> = {}) =>
    request<PaginatedResult<StorySummary>>(storyListPath('/stories/public', options)),
  getStory: (id: string) => request<Story>(`/stories/${id}`),
  getStoryRuntimeBootstrap: (id: string) =>
    request<StoryRuntimeBootstrap>(`/stories/${id}/runtime`),
  getStoryRuntimeContextPage: (id: string, page: number, pageSize = STORY_EDITOR_PAGE_SIZE) =>
    request<StoryRuntimeContextPage>(
      paginationPath(`/stories/${id}/runtime/context`, page, pageSize),
    ),
  getStoryRuntimeSlice: (id: string, input: Partial<StoryRuntimeSliceRequest> = {}) =>
    request<StoryRuntimeSlice>(`/stories/${id}/runtime/slice`, {
      method: 'POST',
      body: JSON.stringify({
        ...(input.currentInteractionId ? { currentInteractionId: input.currentInteractionId } : {}),
        ...(input.interactionIds ? { interactionIds: input.interactionIds } : {}),
        ...(input.includeOptions !== undefined ? { includeOptions: input.includeOptions } : {}),
        page: input.page ?? 1,
        pageSize: input.pageSize ?? STORY_EDITOR_PAGE_SIZE,
      }),
    }),
  getStoryEditorBootstrap: (id: string) => request<StoryEditorBootstrap>(`/stories/${id}/editor`),
  getStoryEditorContextPage: (id: string, page: number, pageSize = STORY_EDITOR_PAGE_SIZE) =>
    request<StoryEditorContextPage>(
      paginationPath(`/stories/${id}/editor/context`, page, pageSize),
    ),
  getStoryEditorInteractionPage: (id: string, page: number, pageSize = STORY_EDITOR_PAGE_SIZE) =>
    request<StoryEditorInteractionPage>(
      paginationPath(`/stories/${id}/editor/interactions`, page, pageSize),
    ),
  getStoryEditorTriggerPage: (id: string, page: number, pageSize = STORY_EDITOR_PAGE_SIZE) =>
    request<StoryEditorTriggerPage>(
      paginationPath(`/stories/${id}/editor/triggers`, page, pageSize),
    ),
  getStoryEditorInteractionContentPage: (
    id: string,
    page: number,
    pageSize = STORY_EDITOR_PAGE_SIZE,
  ) =>
    request<StoryEditorInteractionContentPage>(
      paginationPath(`/stories/${id}/editor/content/interactions`, page, pageSize),
    ),
  getStoryEditorTriggerContentPage: (id: string, page: number, pageSize = STORY_EDITOR_PAGE_SIZE) =>
    request<StoryEditorTriggerContentPage>(
      paginationPath(`/stories/${id}/editor/content/triggers`, page, pageSize),
    ),
  getStoryHistory: (id: string) => request<StoryHistory>(`/stories/${id}/history`),
  undoStoryChange: (id: string) =>
    request<StoryHistoryMutationResult>(`/stories/${id}/history/undo`, { method: 'POST' }),
  redoStoryChange: (id: string) =>
    request<StoryHistoryMutationResult>(`/stories/${id}/history/redo`, { method: 'POST' }),
  getStoryAccess: (id: string) => request<StoryAccessConfiguration>(`/stories/${id}/access`),
  updateStoryAccess: (id: string, settings: StoryAccessSettings) =>
    request<StoryAccessConfiguration>(`/stories/${id}/access`, {
      method: 'PATCH',
      body: JSON.stringify({
        visibility: settings.visibility,
        editPolicy: settings.editPolicy,
        commentPolicy: settings.commentPolicy,
      }),
    }),
  setStoryCollaborator: (id: string, email: string, role: StoryCollaboratorRole) =>
    request<StoryAccessConfiguration>(`/stories/${id}/access/collaborators`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    }),
  removeStoryCollaborator: (id: string, userId: string) =>
    request<void>(`/stories/${id}/access/collaborators/${userId}`, { method: 'DELETE' }),
  getReaderProgress: (storyId: string, mode: ReaderAutosaveMode = 'reader') =>
    request<{ progress: ReaderProgress | null }>(readerProgressPath(storyId, mode)).then(
      ({ progress }) => progress,
    ),
  saveReaderProgress: (
    storyId: string,
    input: SaveReaderProgressInput,
    mode: ReaderAutosaveMode = 'reader',
  ) =>
    request<ReaderProgress>(readerProgressPath(storyId, mode), {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteReaderProgress: (storyId: string, mode: ReaderAutosaveMode = 'reader') =>
    request<void>(readerProgressPath(storyId, mode), { method: 'DELETE' }),
  listReaderSaves: (storyId: string) =>
    request<ReaderSaveSummary[]>(`/stories/${storyId}/progress/saves`),
  getReaderSave: (storyId: string, saveId: string) =>
    request<ReaderSave>(`/stories/${storyId}/progress/saves/${saveId}`),
  createReaderSave: (storyId: string, input: CreateReaderSaveInput) =>
    request<ReaderSave>(`/stories/${storyId}/progress/saves`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateReaderSave: (storyId: string, saveId: string, input: CreateReaderSaveInput) =>
    request<ReaderSave>(`/stories/${storyId}/progress/saves/${saveId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteReaderSave: (storyId: string, saveId: string) =>
    request<void>(`/stories/${storyId}/progress/saves/${saveId}`, { method: 'DELETE' }),
  createStory: (title: string) =>
    request<Story>('/stories', { method: 'POST', body: JSON.stringify({ title }) }),
  createDemoStories: () =>
    request<Story[]>('/stories/demo', { method: 'POST', body: JSON.stringify({}) }),
  importChoiceScript: (files: ChoiceScriptSourceFile[]) =>
    request<ChoiceScriptImportResponse>('/stories/imports/choicescript', {
      method: 'POST',
      body: JSON.stringify({ files }),
    }),
  importQsp: (file: { name: string; format: QspSourceFormat; contentBase64: string }) =>
    request<QspImportResponse>('/stories/imports/qsp', {
      method: 'POST',
      body: JSON.stringify({ file }),
    }),
  importUnlimitedQsp: (
    file: { name: string; format: QspSourceFormat; content: Blob },
    onUploadProgress?: (percentage: number) => void,
  ) =>
    uploadBinary<QspImportResponse>(
      `/stories/imports/qsp/admin?name=${encodeURIComponent(file.name)}&format=${file.format}`,
      file.content,
      onUploadProgress,
    ),
  renameStory: (id: string, title: string) =>
    request<Story>(`/stories/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  updateStory: (id: string, input: UpdateStoryInput) =>
    request<Story>(`/stories/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteStory: (id: string) => request<void>(`/stories/${id}`, { method: 'DELETE' }),
  updateStoryGraphPositions: (id: string, input: StoryGraphPositionUpdates) =>
    request<StoryMutationMetadata>(`/stories/${id}/graph/positions`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  listCommentThreads: (storyId: string) =>
    request<StoryCommentThread[]>(`/stories/${storyId}/comment-threads`),
  createCommentThread: (storyId: string, anchor: CommentAnchor, body: string) =>
    request<StoryCommentThread>(`/stories/${storyId}/comment-threads`, {
      method: 'POST',
      body: JSON.stringify({ anchor, body }),
    }),
  addCommentMessage: (storyId: string, threadId: string, body: string) =>
    request<StoryCommentThread>(`/stories/${storyId}/comment-threads/${threadId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  updateCommentThreadStatus: (
    storyId: string,
    threadId: string,
    status: StoryCommentThread['status'],
  ) =>
    request<StoryCommentThread>(`/stories/${storyId}/comment-threads/${threadId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  updateCommentThreadAnchor: (storyId: string, threadId: string, anchor: CommentAnchor) =>
    request<StoryCommentThread>(`/stories/${storyId}/comment-threads/${threadId}/anchor`, {
      method: 'PATCH',
      body: JSON.stringify({ anchor }),
    }),
  createInteraction: (storyId: string, input: CreateInteractionInput) =>
    request<InteractionSaveResponse>(`/stories/${storyId}/interactions`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateInteraction: (storyId: string, interactionId: string, input: UpdateInteractionInput) =>
    request<InteractionSaveResponse>(`/stories/${storyId}/interactions/${interactionId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteInteraction: (storyId: string, interactionId: string) =>
    request<Story>(`/stories/${storyId}/interactions/${interactionId}`, { method: 'DELETE' }),
  createGraphDecoration: (storyId: string, input: CreateGraphDecorationInput) =>
    request<GraphDecorationMutationResult>(`/stories/${storyId}/graph-decorations`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateGraphDecoration: (
    storyId: string,
    decorationId: string,
    input: UpdateGraphDecorationInput,
  ) =>
    request<GraphDecorationMutationResult>(
      `/stories/${storyId}/graph-decorations/${decorationId}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    ),
  deleteGraphDecoration: (storyId: string, decorationId: string) =>
    request<Story>(`/stories/${storyId}/graph-decorations/${decorationId}`, {
      method: 'DELETE',
    }),
  createLocation: (storyId: string, input: CreateLocationInput) =>
    request<LocationMutationResult>(`/stories/${storyId}/locations`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateLocation: (storyId: string, locationId: string, input: UpdateLocationInput) =>
    request<LocationMutationResult>(`/stories/${storyId}/locations/${locationId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  createCharacter: (storyId: string, input: CreateCharacterInput) =>
    request<CharacterMutationResult>(`/stories/${storyId}/characters`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateCharacter: (storyId: string, characterId: string, input: UpdateCharacterInput) =>
    request<CharacterMutationResult>(`/stories/${storyId}/characters/${characterId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  createStatDefinition: (storyId: string, input: CreateStatDefinitionInput) =>
    request<StatDefinitionMutationResult>(`/stories/${storyId}/stat-definitions`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateStatDefinition: (
    storyId: string,
    statDefinitionId: string,
    input: UpdateStatDefinitionInput,
  ) =>
    request<StatDefinitionMutationResult>(
      `/stories/${storyId}/stat-definitions/${statDefinitionId}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    ),
  deleteStatDefinition: (storyId: string, statDefinitionId: string) =>
    request<Story>(`/stories/${storyId}/stat-definitions/${statDefinitionId}`, {
      method: 'DELETE',
    }),
  createStatAssignment: (storyId: string, input: CreateStatAssignmentInput) =>
    request<Story>(`/stories/${storyId}/stats`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateStatAssignment: (storyId: string, statId: string, input: UpdateStatAssignmentInput) =>
    request<Story>(`/stories/${storyId}/stats/${statId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteStatAssignment: (storyId: string, statId: string) =>
    request<Story>(`/stories/${storyId}/stats/${statId}`, {
      method: 'DELETE',
    }),
  createItemDefinition: (storyId: string, input: CreateItemDefinitionInput) =>
    request<ItemDefinitionMutationResult>(`/stories/${storyId}/item-definitions`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateItemDefinition: (
    storyId: string,
    itemDefinitionId: string,
    input: UpdateItemDefinitionInput,
  ) =>
    request<ItemDefinitionMutationResult>(
      `/stories/${storyId}/item-definitions/${itemDefinitionId}`,
      { method: 'PATCH', body: JSON.stringify(input) },
    ),
  createCharacterStat: (storyId: string, characterId: string, input: CreateCharacterStatInput) =>
    request<CharacterStatMutationResult>(`/stories/${storyId}/characters/${characterId}/stats`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateCharacterStat: (
    storyId: string,
    characterId: string,
    statId: string,
    input: UpdateCharacterStatInput,
  ) =>
    request<CharacterStatMutationResult>(
      `/stories/${storyId}/characters/${characterId}/stats/${statId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
    ),
  deleteCharacterStat: (storyId: string, characterId: string, statId: string) =>
    request<Story>(`/stories/${storyId}/characters/${characterId}/stats/${statId}`, {
      method: 'DELETE',
    }),
  createCharacterItem: (storyId: string, characterId: string, input: CreateCharacterItemInput) =>
    request<CharacterItemMutationResult>(`/stories/${storyId}/characters/${characterId}/items`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  deleteCharacterItem: (storyId: string, characterId: string, itemId: string) =>
    request<Story>(`/stories/${storyId}/characters/${characterId}/items/${itemId}`, {
      method: 'DELETE',
    }),
  moveItemInstance: (storyId: string, itemId: string, input: MoveItemInstanceInput) =>
    request<Story>(`/stories/${storyId}/items/${itemId}/placement`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  addTrigger: (
    storyId: string,
    interactionId: string,
    input: UpdateTriggerInput = { inputInteractionIds: [] },
  ) =>
    request<TriggerSaveResponse>(`/stories/${storyId}/interactions/${interactionId}/triggers`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateTrigger: (
    storyId: string,
    interactionId: string,
    triggerId: string,
    input: UpdateTriggerInput,
  ) =>
    request<TriggerSaveResponse>(
      `/stories/${storyId}/interactions/${interactionId}/triggers/${triggerId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      },
    ),
  deleteTrigger: (storyId: string, interactionId: string, triggerId: string) =>
    request<Story>(`/stories/${storyId}/interactions/${interactionId}/triggers/${triggerId}`, {
      method: 'DELETE',
    }),
};
