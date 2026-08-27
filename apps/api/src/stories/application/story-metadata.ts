import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  createDemoStories,
  defaultStoryAccess,
  ensureStoryInteractionPositions,
  isStoryDateTime,
  type Story,
  type UserRole,
} from '@paralleax/shared';
import type { CreateStoryDto, UpdateStoryDto } from '../dto/stories.dto';
import { StoriesRepository } from '../stories.repository';
import { StoryEventsService } from '../story.events';
import { StoryMutationService } from './story-mutations';

@Injectable()
export class StoryMetadataService {
  constructor(
    private readonly repository: StoriesRepository,
    private readonly events: StoryEventsService,
    private readonly mutations: StoryMutationService,
  ) {}

  list(userId: string) {
    return this.repository.list(userId);
  }

  listPublic() {
    return this.repository.listPublic();
  }

  async get(storyId: string, userId?: string): Promise<Story> {
    const story = await this.repository.find(storyId, userId);
    if (!story) throw new NotFoundException('Story not found');
    return structuredClone(ensureStoryInteractionPositions(story));
  }

  async stream(storyId: string, userId: string) {
    const story = await this.get(storyId, userId);
    if (!story.capabilities?.canEdit) {
      throw new ForbiddenException('Story edit access required');
    }
    return this.events.stream(storyId);
  }

  async create(input: CreateStoryDto, userId: string): Promise<Story> {
    const now = new Date().toISOString();
    const story: Story = {
      id: randomUUID(),
      revision: 1,
      title: input.title.trim() || 'Untitled',
      startDateTime: now.slice(0, 16),
      locations: [],
      characters: [],
      interactions: [],
      access: { ...defaultStoryAccess },
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.save(story, userId);
    return structuredClone(story);
  }

  async createDemo(userId: string, actorRole: UserRole): Promise<Story[]> {
    if (actorRole !== 'admin') {
      throw new ForbiddenException('Administrator access required');
    }
    const now = new Date().toISOString();
    const stories = createDemoStories(now, () => randomUUID()).map((story) => ({
      ...story,
      access: { ...defaultStoryAccess },
    }));
    await this.repository.saveMany(stories, userId);
    return structuredClone(stories);
  }

  update(storyId: string, input: UpdateStoryDto, userId: string): Promise<Story> {
    return this.mutations.update(
      storyId,
      (story) => {
        if (input.title !== undefined) story.title = input.title.trim() || 'Untitled';
        if (input.startDateTime !== undefined) {
          if (!isStoryDateTime(input.startDateTime)) {
            throw new BadRequestException('Story start date and time is invalid');
          }
          story.startDateTime = input.startDateTime;
        }
        return story;
      },
      userId,
    );
  }

  async delete(storyId: string, userId: string): Promise<void> {
    if (!(await this.repository.delete(storyId, userId))) {
      throw new NotFoundException('Story not found');
    }
    this.events.publishChange(storyId, 'deleted');
  }
}
