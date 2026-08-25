import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { StoryAccessSettings } from '@paralleax/shared';
import type { SetStoryCollaboratorDto, UpdateStoryAccessDto } from '../dto/stories.dto';
import { StoriesRepository } from '../stories.repository';
import { StoryEventsService } from '../story.events';

@Injectable()
export class StoryAccessService {
  constructor(
    private readonly repository: StoriesRepository,
    private readonly events: StoryEventsService,
  ) {}

  async get(storyId: string, userId: string) {
    const access = await this.repository.getAccess(storyId, userId);
    if (!access) throw new NotFoundException('Story not found');
    return access;
  }

  async update(storyId: string, input: UpdateStoryAccessDto, userId: string) {
    const settings: StoryAccessSettings = {
      visibility: input.visibility,
      editPolicy: input.editPolicy,
      commentPolicy: input.commentPolicy,
    };
    if (!(await this.repository.updateAccess(storyId, userId, settings))) {
      throw new NotFoundException('Story not found');
    }
    this.events.publishChange(storyId, 'access-updated');
    return this.get(storyId, userId);
  }

  async setCollaborator(storyId: string, input: SetStoryCollaboratorDto, userId: string) {
    await this.get(storyId, userId);
    const email = input.email.trim().toLowerCase();
    if (!(await this.repository.setCollaborator(storyId, userId, email, input.role))) {
      throw new BadRequestException('The collaborator must be an existing non-owner account');
    }
    this.events.publishChange(storyId, 'access-updated');
    return this.get(storyId, userId);
  }

  async removeCollaborator(storyId: string, collaboratorId: string, userId: string) {
    await this.get(storyId, userId);
    if (await this.repository.removeCollaborator(storyId, userId, collaboratorId)) {
      this.events.publishChange(storyId, 'access-updated');
    }
  }
}
