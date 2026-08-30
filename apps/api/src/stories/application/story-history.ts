import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { StoryHistory, StoryHistoryMutationResult } from '@paralleax/shared';
import { StoriesRepository } from '../stories.repository';
import { StoryEventsService } from '../story.events';

@Injectable()
export class StoryHistoryService {
  constructor(
    private readonly repository: StoriesRepository,
    private readonly events: StoryEventsService,
  ) {}

  async get(storyId: string, userId: string): Promise<StoryHistory> {
    const history = await this.repository.getHistory(storyId, userId);
    if (!history) throw new NotFoundException('Story not found');
    return history;
  }

  undo(storyId: string, userId: string): Promise<StoryHistoryMutationResult> {
    return this.revert(storyId, userId, 'undo');
  }

  redo(storyId: string, userId: string): Promise<StoryHistoryMutationResult> {
    return this.revert(storyId, userId, 'redo');
  }

  private async revert(
    storyId: string,
    userId: string,
    action: 'undo' | 'redo',
  ): Promise<StoryHistoryMutationResult> {
    const result = await this.repository.revertHistory(storyId, userId, action);
    if (!result) throw new NotFoundException('Story not found');
    if (result.kind === 'unavailable') {
      throw new ConflictException(`There is no Story change to ${action}.`);
    }
    if (result.kind === 'conflict') {
      throw new ConflictException({
        message: `The Story change can no longer be ${action === 'undo' ? 'undone' : 'redone'} safely.`,
        conflicts: result.paths,
      });
    }
    this.events.publishChange(
      storyId,
      'updated',
      'story' in result.result ? result.result.story.revision : result.result.revision,
    );
    return result.result;
  }
}
