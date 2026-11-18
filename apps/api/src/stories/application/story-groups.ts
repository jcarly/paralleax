import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  removeStoryGroup,
  moveStoryGroup,
  setStoryGroupInteractions,
  validateStoryGroups,
  storyHistoryOperations,
  type GroupDeletionResult,
  type GroupMutationResult,
  type Story,
} from '@paralleax/shared';
import type { CreateGroupDto, UpdateGroupDto } from '../dto/stories.dto';
import { storyMutationMetadata } from './story-mutation-results';
import { StoryMutationService } from './story-mutations';

@Injectable()
export class StoryGroupService {
  constructor(private readonly mutations: StoryMutationService) {}

  async create(
    storyId: string,
    input: CreateGroupDto,
    userId: string,
  ): Promise<GroupMutationResult> {
    const groupId = randomUUID();
    const title = input.title.trim();

    const story = await this.mutations.update(
      storyId,
      (currentStory) => {
        (currentStory.groups ??= []).push({
          id: groupId,
          title,
          interactionIds: [...input.interactionIds],
          ...(input.parentGroupId ? { parentGroupId: input.parentGroupId } : {}),
        });
        const next = setStoryGroupInteractions(currentStory, groupId, input.interactionIds);
        this.validate(next);
        return next;
      },
      userId,
      storyHistoryOperations.groupCreated,
    );
    return {
      ...storyMutationMetadata(story),
      group: this.group(story, groupId),
    };
  }

  async update(
    storyId: string,
    groupId: string,
    input: UpdateGroupDto,
    userId: string,
  ): Promise<GroupMutationResult> {
    const story = await this.mutations.update(
      storyId,
      (currentStory) => {
        const group = this.group(currentStory, groupId);
        if (input.title !== undefined) {
          group.title = input.title.trim();
        }
        if (input.parentGroupId === null) {
          delete group.parentGroupId;
        } else if (input.parentGroupId !== undefined) {
          group.parentGroupId = input.parentGroupId;
        }
        let next =
          input.interactionIds === undefined
            ? currentStory
            : setStoryGroupInteractions(currentStory, groupId, input.interactionIds);
        if (input.beforeGroupId !== undefined) {
          try {
            next = moveStoryGroup(next, groupId, group.parentGroupId ?? null, input.beforeGroupId);
          } catch (error) {
            throw new BadRequestException(error instanceof Error ? error.message : String(error));
          }
        }
        this.validate(next);
        return next;
      },
      userId,
      storyHistoryOperations.groupUpdated,
    );
    return {
      ...storyMutationMetadata(story),
      group: this.group(story, groupId),
      ...(input.beforeGroupId !== undefined
        ? { groupOrder: (story.groups ?? []).map(({ id }) => id) }
        : {}),
    };
  }

  async delete(storyId: string, groupId: string, userId: string): Promise<GroupDeletionResult> {
    const story = await this.mutations.update(
      storyId,
      (currentStory) => {
        this.group(currentStory, groupId);
        return removeStoryGroup(currentStory, groupId);
      },
      userId,
      storyHistoryOperations.groupDeleted,
    );
    return { ...storyMutationMetadata(story), groupId };
  }

  private validate(story: Story) {
    const error = validateStoryGroups(story);
    if (error) {
      throw new BadRequestException(error);
    }
  }

  private group(story: Story, groupId: string) {
    const group = (story.groups ?? []).find(({ id }) => id === groupId);
    if (!group) {
      throw new NotFoundException('Group not found');
    }
    return group;
  }
}
