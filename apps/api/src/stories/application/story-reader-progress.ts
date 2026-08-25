import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  buildReaderProgressState,
  getStoryItemEntries,
  type ReaderProgress,
  type Story,
} from '@paralleax/shared';
import type { SaveReaderProgressDto } from '../dto/stories.dto';
import { StoriesRepository } from '../stories.repository';

@Injectable()
export class StoryReaderProgressService {
  constructor(private readonly repository: StoriesRepository) {}

  async get(storyId: string, userId: string): Promise<ReaderProgress | null> {
    await this.story(storyId, userId);
    return (await this.repository.findProgress(storyId, userId)) ?? null;
  }

  async save(
    storyId: string,
    input: SaveReaderProgressDto,
    userId: string,
  ): Promise<ReaderProgress> {
    const story = await this.story(storyId, userId);
    const interactionIds = new Set(story.interactions.map(({ id }) => id));
    if (input.journeyInteractionIds.some((id) => !interactionIds.has(id))) {
      throw new BadRequestException('Reader journey interactions must belong to the same story');
    }
    const itemIds = new Set(getStoryItemEntries(story).map(({ item }) => item.id));
    if ((input.ownedItemIds ?? []).some((id) => !itemIds.has(id))) {
      throw new BadRequestException('Reader items must belong to the same story');
    }

    const state = buildReaderProgressState(story, input.journeyInteractionIds, input.ownedItemIds);
    const updatedAt = new Date().toISOString();
    if (!(await this.repository.saveProgress(storyId, userId, state, updatedAt))) {
      throw new NotFoundException('Story not found');
    }
    return { state, updatedAt };
  }

  async delete(storyId: string, userId: string): Promise<void> {
    await this.story(storyId, userId);
    await this.repository.deleteProgress(storyId, userId);
  }

  private async story(storyId: string, userId: string): Promise<Story> {
    const story = await this.repository.find(storyId, userId);
    if (!story) throw new NotFoundException('Story not found');
    return story;
  }
}
