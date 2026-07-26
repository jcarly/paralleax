import type {
  CharacterMutationResult,
  CharacterItemMutationResult,
  CharacterStatMutationResult,
  CreateCharacterInput,
  CreateCharacterItemInput,
  CreateCharacterStatInput,
  CreateInteractionInput,
  CreateItemDefinitionInput,
  CreateLocationInput,
  CreateStatDefinitionInput,
  InteractionMutationResult,
  ItemDefinitionMutationResult,
  LocationMutationResult,
  StatDefinitionMutationResult,
  Story,
  TriggerMutationResult,
  UpdateInteractionInput,
  UpdateItemDefinitionInput,
  UpdateCharacterInput,
  UpdateCharacterStatInput,
  UpdateLocationInput,
  UpdateStatDefinitionInput,
  UpdateTriggerInput,
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
  createdAt: string;
}
type InteractionSaveResponse = InteractionMutationResult | Story;
type TriggerSaveResponse = TriggerMutationResult | Story;
export const api = {
  me: () => request<AuthUser>('/auth/me'),
  register: (email: string, password: string) =>
    request<AuthUser>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  login: (email: string, password: string) =>
    request<AuthUser>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  listStories: () => request<Story[]>('/stories'),
  getStory: (id: string) => request<Story>(`/stories/${id}`),
  createStory: (title: string) =>
    request<Story>('/stories', { method: 'POST', body: JSON.stringify({ title }) }),
  createDemoStory: () =>
    request<Story>('/stories/demo', { method: 'POST', body: JSON.stringify({}) }),
  renameStory: (id: string, title: string) =>
    request<Story>(`/stories/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  deleteStory: (id: string) => request<void>(`/stories/${id}`, { method: 'DELETE' }),
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
  createCharacterItem: (storyId: string, characterId: string, input: CreateCharacterItemInput) =>
    request<CharacterItemMutationResult>(`/stories/${storyId}/characters/${characterId}/items`, {
      method: 'POST',
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
