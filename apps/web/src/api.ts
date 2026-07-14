import type { CreateInteractionInput, Story, UpdateInteractionInput, UpdateTriggerInput } from '@paralleax/shared';
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}
export const api = {
  listStories: () => request<Story[]>('/stories'),
  getStory: (id: string) => request<Story>(`/stories/${id}`),
  createStory: (title?: string) => request<Story>('/stories', { method: 'POST', body: JSON.stringify({ title }) }),
  renameStory: (id: string, title: string) => request<Story>(`/stories/${id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  deleteStory: (id: string) => request<void>(`/stories/${id}`, { method: 'DELETE' }),
  createInteraction: (storyId: string, input: CreateInteractionInput) => request<Story>(`/stories/${storyId}/interactions`, { method: 'POST', body: JSON.stringify(input) }),
  updateInteraction: (storyId: string, interactionId: string, input: UpdateInteractionInput) => request<Story>(`/stories/${storyId}/interactions/${interactionId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteInteraction: (storyId: string, interactionId: string) => request<Story>(`/stories/${storyId}/interactions/${interactionId}`, { method: 'DELETE' }),
  addTrigger: (storyId: string, interactionId: string) => request<Story>(`/stories/${storyId}/interactions/${interactionId}/triggers`, { method: 'POST' }),
  updateTrigger: (storyId: string, interactionId: string, triggerId: string, input: UpdateTriggerInput) => request<Story>(`/stories/${storyId}/interactions/${interactionId}/triggers/${triggerId}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteTrigger: (storyId: string, interactionId: string, triggerId: string) => request<Story>(`/stories/${storyId}/interactions/${interactionId}/triggers/${triggerId}`, { method: 'DELETE' }),
};
