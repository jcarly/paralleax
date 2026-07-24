import type {
  CreateInteractionInput,
  InteractionMutationResult,
  Story,
  TriggerMutationResult,
  UpdateInteractionInput,
  UpdateTriggerInput,
} from '@paralleax/shared';
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
    try {
      const error = JSON.parse(body) as { message?: string | string[] };
      if (Array.isArray(error.message)) message = error.message.join(', ');
      else if (error.message) message = error.message;
    } catch {
      // Preserve plain-text and non-JSON error responses.
    }
    throw new Error(message);
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
