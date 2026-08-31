import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ensureStoryInteractionPositions,
  storyHistoryOperations,
  type Story,
} from '@paralleax/shared';
import { StoriesRepository } from '../stories.repository';
import { StoryEventsService } from '../story.events';

@Injectable()
export class StoryMutationService {
  constructor(
    private readonly repository: StoriesRepository,
    private readonly events: StoryEventsService,
  ) {}

  async update(
    storyId: string,
    mutation: (story: Story) => Story,
    userId: string,
    operation: string = storyHistoryOperations.storyUpdated,
  ): Promise<Story> {
    const updated = await this.repository.mutate(
      storyId,
      (story) => {
        const next = mutation(story);
        next.id = storyId;
        next.interactions = ensureStoryInteractionPositions(next).interactions;
        next.updatedAt = new Date().toISOString();
        next.revision = (story.revision ?? 1) + 1;
        return next;
      },
      userId,
      operation,
    );
    if (!updated) throw new NotFoundException('Story not found');
    this.events.publishChange(storyId, 'updated', updated.revision);
    return updated;
  }
}
