import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  removeStoryGroup,
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
      (story) => {
        (story.groups ??= []).push({
          id: groupId,
          title,
          interactionIds: [...input.interactionIds],
        });
        const next = setStoryGroupInteractions(story, groupId, input.interactionIds);
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
      (story) => {
        const group = this.group(story, groupId);
        if (input.title !== undefined) group.title = input.title.trim();
        if (input.parentGroupId === null) delete group.parentGroupId;
        else if (input.parentGroupId !== undefined) group.parentGroupId = input.parentGroupId;
        const next =
          input.interactionIds === undefined
            ? story
            : setStoryGroupInteractions(story, groupId, input.interactionIds);
        this.validate(next);
        return next;
      },
      userId,
      storyHistoryOperations.groupUpdated,
    );
    return { ...storyMutationMetadata(story), group: this.group(story, groupId) };
  }

  async delete(storyId: string, groupId: string, userId: string): Promise<GroupDeletionResult> {
    const story = await this.mutations.update(
      storyId,
      (story) => {
        this.group(story, groupId);
        return removeStoryGroup(story, groupId);
      },
      userId,
      storyHistoryOperations.groupDeleted,
    );
    return { ...storyMutationMetadata(story), groupId };
  }

  private validate(story: Story) {
    const error = validateStoryGroups(story);
    if (error) throw new BadRequestException(error);
  }

  private group(story: Story, groupId: string) {
    const group = (story.groups ?? []).find(({ id }) => id === groupId);
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }
}
