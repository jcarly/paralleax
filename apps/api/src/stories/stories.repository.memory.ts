import type { ReaderProgress, ReaderProgressState, Story, StorySummary } from '@paralleax/shared';

export class InMemoryStoriesRepository {
  private readonly stories = new Map<string, Story>();
  private readonly owners = new Map<string, string>();
  private readonly mutationQueues = new Map<string, Promise<void>>();
  private readonly progress = new Map<string, ReaderProgress>();

  async list(ownerId: string): Promise<StorySummary[]> {
    return [...this.stories.entries()]
      .filter(([id]) => this.owners.get(id) === ownerId)
      .map(([, story]) => ({
        id: story.id,
        revision: story.revision,
        title: story.title,
        interactionCount: story.interactions.length,
        startDateTime: story.startDateTime,
        createdAt: story.createdAt,
        updatedAt: story.updatedAt,
      }));
  }

  async find(id: string, ownerId: string): Promise<Story | undefined> {
    if (this.owners.get(id) !== ownerId) return undefined;
    const story = this.stories.get(id);
    return story ? structuredClone(story) : undefined;
  }

  async save(story: Story, ownerId: string): Promise<void> {
    this.stories.set(story.id, structuredClone(story));
    this.owners.set(story.id, ownerId);
  }

  async mutate(
    id: string,
    mutation: (story: Story) => Story | Promise<Story>,
    ownerId: string,
  ): Promise<Story | undefined> {
    const previous = this.mutationQueues.get(id) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const current = previous.then(() => gate);
    this.mutationQueues.set(id, current);
    await previous;

    try {
      const story = this.owners.get(id) === ownerId ? this.stories.get(id) : undefined;
      if (!story) return undefined;
      const updated = await mutation(structuredClone(story));
      this.stories.set(id, structuredClone(updated));
      return structuredClone(updated);
    } finally {
      release();
      if (this.mutationQueues.get(id) === current) this.mutationQueues.delete(id);
    }
  }

  async delete(id: string, ownerId: string): Promise<boolean> {
    if (this.owners.get(id) !== ownerId) return false;
    this.owners.delete(id);
    this.progress.delete(`${ownerId}:${id}`);
    return this.stories.delete(id);
  }

  async findProgress(storyId: string, userId: string): Promise<ReaderProgress | undefined> {
    if (this.owners.get(storyId) !== userId) return undefined;
    const progress = this.progress.get(`${userId}:${storyId}`);
    return progress ? structuredClone(progress) : undefined;
  }

  async saveProgress(
    storyId: string,
    userId: string,
    state: ReaderProgressState,
    updatedAt: string,
  ): Promise<boolean> {
    if (this.owners.get(storyId) !== userId) return false;
    this.progress.set(`${userId}:${storyId}`, {
      state: structuredClone(state),
      updatedAt,
    });
    return true;
  }

  async deleteProgress(storyId: string, userId: string): Promise<void> {
    this.progress.delete(`${userId}:${storyId}`);
  }
}
