import type {
  CharacterMutationResult,
  ChoiceScriptImportReport,
  ChoiceScriptSourceFile,
  CommentAnchor,
  CharacterItemMutationResult,
  CharacterStatMutationResult,
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
  ReaderProgress,
  SaveReaderProgressInput,
  StatDefinitionMutationResult,
  Story,
  StoryCommentThread,
  StorySummary,
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
    if (response.status === 401 && !path.startsWith('/auth/')) {
      window.dispatchEvent(new Event('paralleax:session-expired'));
    }
    const body = await response.text();
    let message = body || `HTTP ${response.status}`;
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
    throw new ApiError(message, response.status, code, requestId);
  }
  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}
export interface ManagedUser {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
}
type InteractionSaveResponse = InteractionMutationResult | Story;
type TriggerSaveResponse = TriggerMutationResult | Story;
export interface ChoiceScriptImportResponse {
  story: Story;
  report: ChoiceScriptImportReport;
}
export const api = {
  me: () => request<AuthUser>('/auth/me'),
  register: (email: string, password: string, accessCode?: string) =>
    request<AuthUser>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, ...(accessCode ? { accessCode } : {}) }),
    }),
  login: (email: string, password: string) =>
    request<AuthUser>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  listUsers: () => request<ManagedUser[]>('/admin/users'),
  updateUserRole: (id: string, role: UserRole) =>
    request<ManagedUser>(`/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    }),
  listStories: () => request<StorySummary[]>('/stories'),
  listPublicStories: () => request<StorySummary[]>('/stories/public'),
  getStory: (id: string) => request<Story>(`/stories/${id}`),
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
  getReaderProgress: (storyId: string) =>
    request<{ progress: ReaderProgress | null }>(`/stories/${storyId}/progress`).then(
      ({ progress }) => progress,
    ),
  saveReaderProgress: (storyId: string, input: SaveReaderProgressInput) =>
    request<ReaderProgress>(`/stories/${storyId}/progress`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteReaderProgress: (storyId: string) =>
    request<void>(`/stories/${storyId}/progress`, { method: 'DELETE' }),
  createStory: (title: string) =>
    request<Story>('/stories', { method: 'POST', body: JSON.stringify({ title }) }),
  createDemoStories: () =>
    request<Story[]>('/stories/demo', { method: 'POST', body: JSON.stringify({}) }),
  importChoiceScript: (files: ChoiceScriptSourceFile[]) =>
    request<ChoiceScriptImportResponse>('/stories/imports/choicescript', {
      method: 'POST',
      body: JSON.stringify({ files }),
    }),
  renameStory: (id: string, title: string) =>
    request<Story>(`/stories/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  updateStory: (id: string, input: UpdateStoryInput) =>
    request<Story>(`/stories/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteStory: (id: string) => request<void>(`/stories/${id}`, { method: 'DELETE' }),
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
    input: UpdateTriggerInput = { inputInteractionIds: [], conditions: [] },
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
