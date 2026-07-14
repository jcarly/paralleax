import { Injectable } from '@nestjs/common';
import type { Story } from '@paralleax/shared';

@Injectable()
export class StoriesRepository {
  private readonly stories = new Map<string, Story>();

  list(): Story[] {
    return [...this.stories.values()].map((story) => structuredClone(story));
  }

  find(id: string): Story | undefined {
    return this.stories.get(id);
  }

  save(story: Story): void {
    this.stories.set(story.id, story);
  }

  delete(id: string): boolean {
    return this.stories.delete(id);
  }
}
