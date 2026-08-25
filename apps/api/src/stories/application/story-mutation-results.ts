import type { Story, StoryMutationMetadata } from '@paralleax/shared';

export function storyMutationMetadata(story: Story): StoryMutationMetadata {
  return {
    revision: story.revision ?? 1,
    updatedAt: story.updatedAt,
  };
}
