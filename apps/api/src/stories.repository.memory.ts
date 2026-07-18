import type { Story } from '@paralleax/shared';

export class InMemoryStoriesRepository {
  private readonly stories = new Map<string, Story>();
  private readonly mutationQueues = new Map<string, Promise<void>>();

  async list(): Promise<Story[]> {
    return [...this.stories.values()].map((story) => structuredClone(story));
  }

  async find(id: string): Promise<Story | undefined> {
    const story = this.stories.get(id);
    return story ? structuredClone(story) : undefined;
  }

  async save(story: Story): Promise<void> {
    this.stories.set(story.id, structuredClone(story));
  }

  async mutate(
    id: string,
    mutation: (story: Story) => Story | Promise<Story>,
  ): Promise<Story | undefined> {
    const previous = this.mutationQueues.get(id) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const current = previous.then(() => gate);
    this.mutationQueues.set(id, current);
    await previous;

    try {
      const story = this.stories.get(id);
      if (!story) return undefined;
      const updated = await mutation(structuredClone(story));
      this.stories.set(id, structuredClone(updated));
      return structuredClone(updated);
    } finally {
      release();
      if (this.mutationQueues.get(id) === current) this.mutationQueues.delete(id);
    }
  }

  async delete(id: string): Promise<boolean> {
    return this.stories.delete(id);
  }
}
