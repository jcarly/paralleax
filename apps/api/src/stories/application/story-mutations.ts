import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ensureStoryInteractionPositions,
  storyHistoryOperations,
  type Story,
} from '@paralleax/shared';
import { StoriesRepository, type StoryChangeProposalCommit } from '../stories.repository';
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
      (story) => nextRevision(storyId, story, mutation),
      userId,
      operation,
    );
    if (!updated) {
      return this.accessError(storyId, userId);
    }
    this.events.publishChange(storyId, 'updated', updated.revision);
    return updated;
  }

  /**
   * Applies a change batch as one mutation with one revision and one history
   * event (ADR-050), or reports the earlier commit of the same proposal.
   */
  async commitProposal(input: {
    storyId: string;
    mutation: (story: Story) => Story;
    userId: string;
    proposal: { digest: string; result: unknown };
  }): Promise<StoryChangeProposalCommit> {
    const committed = await this.repository.commitChangeProposal({
      id: input.storyId,
      mutation: (story) => nextRevision(input.storyId, story, input.mutation),
      ownerId: input.userId,
      operation: storyHistoryOperations.storyChangesCommitted,
      proposal: input.proposal,
    });
    if (!committed) {
      return this.accessError(input.storyId, input.userId);
    }
    if (committed.kind === 'committed') {
      this.events.publishChange(input.storyId, 'updated', committed.story.revision);
    }
    return committed;
  }

  /** Forbidden for a Story the user can read, not found otherwise. */
  async accessError(storyId: string, userId: string): Promise<never> {
    if (await this.repository.find(storyId, userId)) {
      throw new ForbiddenException('Story edit access required');
    }
    throw new NotFoundException('Story not found');
  }
}

function nextRevision(storyId: string, story: Story, mutation: (story: Story) => Story): Story {
  const next = mutation(story);
  next.id = storyId;
  next.interactions = ensureStoryInteractionPositions(next).interactions;
  next.updatedAt = new Date().toISOString();
  next.revision = (story.revision ?? 1) + 1;
  return next;
}
