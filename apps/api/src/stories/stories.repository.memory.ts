import type { Story } from '@paralleax/shared';

export class InMemoryStoriesRepository {
  private readonly stories = new Map<string, Story>();
  private readonly owners = new Map<string, string>();
  private readonly mutationQueues = new Map<string, Promise<void>>();

  async list(ownerId = 'migration-user'): Promise<Story[]> {
    return [...this.stories.entries()]
      .filter(([id]) => this.owners.get(id) === ownerId)
      .map(([, story]) => structuredClone(story));
  }

  async find(id: string, ownerId = 'migration-user'): Promise<Story | undefined> {
    if (this.owners.get(id) !== ownerId) return undefined;
    const story = this.stories.get(id);
    return story ? structuredClone(story) : undefined;
  }

  async save(story: Story, ownerId = 'migration-user'): Promise<void> {
    this.stories.set(story.id, structuredClone(story));
    this.owners.set(story.id, ownerId);
  }

  async mutate(
    id: string,
    mutation: (story: Story) => Story | Promise<Story>,
    ownerId = 'migration-user',
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

  async delete(id: string, ownerId = 'migration-user'): Promise<boolean> {
    if (this.owners.get(id) !== ownerId) return false;
    this.owners.delete(id);
    return this.stories.delete(id);
  }
}
