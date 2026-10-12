import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  storyHistoryOperations,
  type GroupMutationResult,
  type Story,
} from '@paralleax/shared';
import type { CreateGroupDto } from '../dto/stories.dto';
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
    if (!title) throw new BadRequestException('Group title cannot be blank');

    const story = await this.mutations.update(
      storyId,
      (story) => {
        if (new Set(input.interactionIds).size !== input.interactionIds.length) {
          throw new BadRequestException('Group Interaction members must be unique');
        }
        const interactionIds = new Set(story.interactions.map(({ id }) => id));
        if (input.interactionIds.some((id) => !interactionIds.has(id))) {
          throw new BadRequestException('Group members must belong to the same Story');
        }
        (story.groups ??= []).push({
          id: groupId,
          title,
          interactionIds: [...input.interactionIds],
        });
        return story;
      },
      userId,
      storyHistoryOperations.groupCreated,
    );
    return {
      ...storyMutationMetadata(story),
      group: this.group(story, groupId),
    };
  }

  private group(story: Story, groupId: string) {
    const group = (story.groups ?? []).find(({ id }) => id === groupId);
    if (!group) throw new NotFoundException('Group not found');
    return group;
  }
}
