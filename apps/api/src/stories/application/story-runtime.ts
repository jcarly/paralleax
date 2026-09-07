import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import {
  MAX_STORY_PAGE_SIZE,
  STORY_EDITOR_PAGE_SIZE,
  appendStoryContextPage,
  createStoryContextAccumulator,
  createStoryLoadingProjection,
  projectStoryContext,
  type Story,
  type StoryRuntimeBootstrap,
  type StoryRuntimeSliceRequest,
} from '@paralleax/shared';
import { StoriesRepository } from '../stories.repository';

@Injectable()
export class StoryRuntimeService {
  constructor(private readonly repository: StoriesRepository) {}

  getBootstrap(storyId: string, userId?: string) {
    return this.requireProjection(this.repository.findRuntimeBootstrap(storyId, userId));
  }

  getAccess(storyId: string, userId?: string) {
    return this.requireProjection(this.repository.findRuntimeAccess(storyId, userId));
  }

  getContextPage(storyId: string, userId: string | undefined, page: number, pageSize: number) {
    return this.requireProjection(
      this.repository.findRuntimeContextPage(storyId, userId, page, pageSize),
    );
  }

  getSlice(storyId: string, userId: string | undefined, request: StoryRuntimeSliceRequest) {
    return this.requireProjection(this.repository.findRuntimeSlice(storyId, userId, request));
  }

  async getStoryForJourney(
    storyId: string,
    userId: string | undefined,
    journeyInteractionIds: readonly string[],
  ): Promise<Story> {
    const bootstrap = await this.getBootstrap(storyId, userId);
    let story = await this.loadContext(storyId, userId, bootstrap);
    const uniqueInteractionIds = [...new Set(journeyInteractionIds)];
    for (let index = 0; index < uniqueInteractionIds.length; index += MAX_STORY_PAGE_SIZE) {
      const slice = await this.getSlice(storyId, userId, {
        interactionIds: uniqueInteractionIds.slice(index, index + MAX_STORY_PAGE_SIZE),
        includeOptions: false,
        page: 1,
        pageSize: STORY_EDITOR_PAGE_SIZE,
      });
      this.assertRevision(bootstrap.revision, slice.revision);
      story = { ...story, interactions: [...story.interactions, ...slice.interactions] };
    }
    return story;
  }

  private async loadContext(
    storyId: string,
    userId: string | undefined,
    bootstrap: StoryRuntimeBootstrap,
  ): Promise<Story> {
    const context = createStoryContextAccumulator();
    const totalCount = Math.max(
      bootstrap.contextCounts.locations,
      bootstrap.contextCounts.characters,
      bootstrap.contextCounts.statDefinitions,
      bootstrap.contextCounts.statAssignments,
      bootstrap.contextCounts.itemDefinitions,
      bootstrap.contextCounts.itemInstances,
    );
    for (let page = 1; page <= Math.ceil(totalCount / STORY_EDITOR_PAGE_SIZE); page += 1) {
      const result = await this.getContextPage(storyId, userId, page, STORY_EDITOR_PAGE_SIZE);
      this.assertRevision(bootstrap.revision, result.revision);
      appendStoryContextPage(context, result);
      if (!result.hasMore || result.page * result.pageSize >= totalCount) break;
    }
    return projectStoryContext(createStoryLoadingProjection(bootstrap), context);
  }

  private assertRevision(expected: number | undefined, received: number): void {
    if ((expected ?? 1) !== received) {
      throw new ConflictException('The Story changed while its runtime state was loading');
    }
  }

  private async requireProjection<T>(projection: Promise<T | undefined>): Promise<T> {
    const result = await projection;
    if (!result) throw new NotFoundException('Story not found');
    return result;
  }
}
