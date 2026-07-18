import type { Story } from '@paralleax/shared';

export class InMemoryStoriesRepository {
  private readonly stories = new Map<string, Story>();

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

  async delete(id: string): Promise<boolean> {
    return this.stories.delete(id);
  }
}
