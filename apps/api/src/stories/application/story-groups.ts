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
    if (input.interactionIds.length === 0 && !input.parentGroupId)
      throw new BadRequestException('Select at least one Interaction to create a root Group');
    const groupId = randomUUID();
    const title = input.title.trim();

    const story = await this.mutations.update(
      storyId,
      (story) => {
        (story.groups ??= []).push({
          id: groupId,
          title,
          interactionIds: [...input.interactionIds],
          ...(input.parentGroupId ? { parentGroupId: input.parentGroupId } : {}),
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
        let next =
          input.interactionIds === undefined
            ? story
            : setStoryGroupInteractions(story, groupId, input.interactionIds);
        if (input.beforeGroupId !== undefined) {
          try {
            next = moveStoryGroup(next, groupId, group.parentGroupId ?? null, input.beforeGroupId);
          } catch (error) {
            throw new BadRequestException((error as Error).message);
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
        ? { groupOrder: story.groups!.map(({ id }) => id) }
        : {}),
    };
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
